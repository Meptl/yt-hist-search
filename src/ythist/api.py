from __future__ import annotations

import os
import tempfile
import logging
import shutil
import time
import json
import traceback
import io
import re
import uuid
import math
from contextlib import redirect_stderr
from pathlib import Path
from threading import Lock, Thread

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Literal

from ythist.indexing import (
    DEFAULT_INDEX_DIR,
    DEFAULT_SCORE_THRESHOLD,
    get_indexed_video_ids,
    index_ready,
    ingest_documents,
    search,
    warmup,
)
from ythist.takeout import (
    dedupe_entries_by_video_id,
    parse_watch_history,
    to_llama_documents,
    write_csv,
)
from ythist.youtube_metadata import validate_youtube_api_key
from ythist.settings import (
    LLM_ROUTER_OPTIONS,
    load_settings,
    resolve_youtube_data_api_key,
    save_settings,
)
from ythist.llm_router import LLMRouterError, rewrite_prompt_with_router

app = FastAPI(title="yt-hist", version="0.1.0")
logger = logging.getLogger(__name__)


class SearchResponseItem(BaseModel):
    score: float | None
    file_path: str
    text: str
    video_id: str | None = None
    video_url: str | None = None
    title: str | None = None
    channel_name: str | None = None
    channel_url: str | None = None
    channel_logo_url: str | None = None
    published_at: str | None = None
    view_count: str | None = None


class SearchResponse(BaseModel):
    query: str
    original_query: str
    static_filters: dict[str, str]
    errors: list[str]
    results: list[SearchResponseItem]


class InitResponse(BaseModel):
    index_dir: str
    data_dir: str


class ImportTakeoutResponse(BaseModel):
    parsed_entries: int
    indexed_entries: int
    csv_out: str
    index_dir: str


class ValidateTakeoutResponse(BaseModel):
    parsed_entries: int
    deduped_entries: int
    new_entries: int
    already_indexed_entries: int


class ValidateYouTubeApiKeyRequest(BaseModel):
    youtube_data_api_key: str | None = None


class ValidateYouTubeApiKeyResponse(BaseModel):
    valid: bool
    message: str


class ImportErrorDetail(BaseModel):
    message: str
    stack_trace: str | None = None


class ImportTakeoutPathRequest(BaseModel):
    takeout_path: str | None = None
    html_path: str | None = None
    index_dir: str = str(DEFAULT_INDEX_DIR)
    data_dir: str = "dev_assets/data"
    skip_index: bool = False


class IndexStatusResponse(BaseModel):
    index_ready: bool
    index_dir: str


ImportJobState = Literal["running", "completed", "failed"]


class ImportTakeoutJobCreateResponse(BaseModel):
    job_id: str
    status: ImportJobState


class ImportTakeoutJobStatusResponse(BaseModel):
    job_id: str
    status: ImportJobState
    progress: float
    messages: list[str]
    result: ImportTakeoutResponse | None = None
    error: ImportErrorDetail | None = None


LLMRouter = Literal["codex", "claude", "gemini", "opencode"]
LLM_ROUTER_CLI_COMMANDS: dict[LLMRouter, str] = {
    "codex": "codex",
    "claude": "claude",
    "gemini": "gemini",
    "opencode": "opencode",
}


class SettingsResponse(BaseModel):
    llm_router: LLMRouter | None = None
    llm_router_options: list[LLMRouter]
    youtube_data_api_key: str | None = None
    score_threshold: float = DEFAULT_SCORE_THRESHOLD
    llm_router_cli_warning: str | None = None


class UpdateSettingsRequest(BaseModel):
    llm_router: LLMRouter | None = None
    llm_backend: LLMRouter | None = None
    youtube_data_api_key: str | None = None
    score_threshold: float | None = None


class _ImportJob:
    def __init__(self, *, job_id: str) -> None:
        self.job_id = job_id
        self.status: ImportJobState = "running"
        self.progress = 0.0
        self.messages: list[str] = []
        self.result: ImportTakeoutResponse | None = None
        self.error: ImportErrorDetail | None = None


class _ImportJobsState:
    def __init__(self) -> None:
        self._lock = Lock()
        self._jobs: dict[str, _ImportJob] = {}

    def create_job(self) -> _ImportJob:
        job = _ImportJob(job_id=uuid.uuid4().hex)
        with self._lock:
            self._jobs[job.job_id] = job
        return job

    def get_job(self, job_id: str) -> _ImportJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def snapshot(self, job_id: str) -> ImportTakeoutJobStatusResponse | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            pending_messages = list(job.messages)
            # Treat backend output as ephemeral: drain after each status read.
            job.messages.clear()
            return ImportTakeoutJobStatusResponse(
                job_id=job.job_id,
                status=job.status,
                progress=job.progress,
                messages=pending_messages,
                result=job.result,
                error=job.error,
            )

    def set_progress(self, job_id: str, progress: float) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status != "running":
                return
            job.progress = max(job.progress, min(100.0, progress))

    def append_message(self, job_id: str, message: str) -> None:
        sanitized = message.strip()
        if not sanitized:
            return
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            if job.messages and job.messages[-1] == sanitized:
                return
            job.messages.append(sanitized)
            if len(job.messages) > 500:
                job.messages = job.messages[-500:]

    def complete(self, job_id: str, result: ImportTakeoutResponse) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = "completed"
            job.progress = 100.0
            job.result = result
            job.error = None

    def fail(self, job_id: str, error: ImportErrorDetail) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = "failed"
            job.error = error


_EMBEDDINGS_PROGRESS_RE = re.compile(r"(\d+)\s*/\s*(\d+)")
_EMBEDDING_PHASE_START_PROGRESS = 20.0
_EMBEDDING_PHASE_SPAN = 80.0
_IMPORT_JOBS = _ImportJobsState()


class _ProgressStream(io.TextIOBase):
    def __init__(self, on_message) -> None:
        self._on_message = on_message
        self._buffer = ""

    def writable(self) -> bool:
        return True

    def write(self, text: str) -> int:
        if not text:
            return 0
        self._buffer += text
        for separator in ("\r", "\n"):
            while separator in self._buffer:
                part, self._buffer = self._buffer.split(separator, 1)
                self._on_message(part)
        return len(text)

    def flush(self) -> None:
        if self._buffer:
            self._on_message(self._buffer)
            self._buffer = ""


class _EmbeddingProgressTracker:
    def __init__(self, expected_items: int | None = None) -> None:
        self._expected_items = expected_items if expected_items and expected_items > 0 else None
        self._completed_items = 0
        self._last_done = 0
        self._last_total = 0
        self._seen_embedding_progress = False

    def expected_batches(self) -> int | None:
        if self._expected_items is None or self._last_total <= 0:
            return None
        return math.ceil(self._expected_items / self._last_total)

    def progress_from_message(self, message: str) -> float | None:
        normalized = message.strip()
        if "Applying transformations:" in normalized:
            return _EMBEDDING_PHASE_START_PROGRESS
        if "Generating embeddings:" not in normalized:
            return None

        match = _EMBEDDINGS_PROGRESS_RE.search(normalized)
        if match is None:
            return _EMBEDDING_PHASE_START_PROGRESS + 5.0

        done = int(match.group(1))
        total = int(match.group(2))
        if total <= 0:
            return _EMBEDDING_PHASE_START_PROGRESS + 5.0

        if self._seen_embedding_progress:
            is_new_batch = done < self._last_done or (done == 0 and total == self._last_total)
            if is_new_batch:
                self._completed_items += self._last_total

        self._seen_embedding_progress = True
        self._last_done = done
        self._last_total = total

        processed_items = self._completed_items + done
        if self._expected_items is not None:
            total_items = self._expected_items
        else:
            total_items = max(self._completed_items + total, processed_items)
        if total_items <= 0:
            return _EMBEDDING_PHASE_START_PROGRESS + 5.0

        embedding_fraction = min(processed_items / total_items, 1.0)
        return min(
            _EMBEDDING_PHASE_START_PROGRESS + (embedding_fraction * _EMBEDDING_PHASE_SPAN),
            99.0,
        )


def _llm_router_cli_warning(llm_router: LLMRouter | None) -> str | None:
    if llm_router is None:
        return None

    cli_command = LLM_ROUTER_CLI_COMMANDS[llm_router]
    if shutil.which(cli_command) is not None:
        return None

    return (
        f"`{cli_command}` CLI was not found in PATH."
    )


def _validate_import_api_key_or_raise(
    *,
    youtube_data_api_key: str | None,
) -> None:
    if not isinstance(youtube_data_api_key, str):
        return

    normalized_api_key = youtube_data_api_key.strip()
    if not normalized_api_key:
        return

    try:
        validate_youtube_api_key(normalized_api_key)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=400,
            detail=ImportErrorDetail(
                message=(
                    "Import aborted: YouTube Data API key validation failed. "
                    f"{exc}"
                ),
                stack_trace="".join(traceback.format_exception(exc)),
            ).model_dump(),
        ) from exc


def _run_import_from_takeout_path(
    takeout_path: Path,
    index_dir: Path,
    data_dir: Path,
    skip_index: bool,
    youtube_data_api_key: str | None,
) -> ImportTakeoutResponse:
    if not takeout_path.exists() or not takeout_path.is_file():
        raise HTTPException(status_code=400, detail=f"File not found: {takeout_path}")
    if takeout_path.suffix.lower() not in {".html", ".htm", ".json"}:
        raise HTTPException(
            status_code=400,
            detail="Expected a .html/.htm/.json takeout file",
        )
    if not skip_index:
        _validate_import_api_key_or_raise(youtube_data_api_key=youtube_data_api_key)

    data_dir.mkdir(parents=True, exist_ok=True)
    index_dir.mkdir(parents=True, exist_ok=True)

    try:
        entries = parse_watch_history(takeout_path)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=400,
            detail=ImportErrorDetail(
                message=str(exc),
                stack_trace="".join(traceback.format_exception(exc)),
            ).model_dump(),
        ) from exc
    if not entries:
        raise HTTPException(
            status_code=400,
            detail="No watch entries found in the provided takeout file.",
        )

    csv_out = data_dir / "youtube_watch_history.csv"
    write_csv(entries, csv_out)

    indexed_entries = 0
    if not skip_index:
        existing_video_ids = get_indexed_video_ids(index_dir)
        docs = to_llama_documents(
            entries,
            youtube_data_api_key=youtube_data_api_key,
            exclude_video_ids=existing_video_ids,
        )
        try:
            indexed_entries = ingest_documents(docs, index_dir=index_dir)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=ImportErrorDetail(
                    message=(
                        "Indexing failed. Ensure internet access is available once for "
                        f"embedding model download. Original error: {exc}"
                    ),
                    stack_trace="".join(traceback.format_exception(exc)),
                ).model_dump(),
            ) from exc

    return ImportTakeoutResponse(
        parsed_entries=len(entries),
        indexed_entries=indexed_entries,
        csv_out=str(csv_out),
        index_dir=str(index_dir),
    )


def _run_import_job(
    *,
    job_id: str,
    takeout_path: Path,
    index_dir: Path,
    data_dir: Path,
    skip_index: bool,
    youtube_data_api_key: str | None,
) -> None:
    _IMPORT_JOBS.append_message(job_id, "Import started")
    _IMPORT_JOBS.set_progress(job_id, 5.0)
    try:
        if not takeout_path.exists() or not takeout_path.is_file():
            raise HTTPException(status_code=400, detail=f"File not found: {takeout_path}")
        if takeout_path.suffix.lower() not in {".html", ".htm", ".json"}:
            raise HTTPException(
                status_code=400,
                detail="Expected a .html/.htm/.json takeout file",
            )
        if not skip_index:
            _IMPORT_JOBS.append_message(job_id, "Validating YouTube Data API key")
            _validate_import_api_key_or_raise(youtube_data_api_key=youtube_data_api_key)

        data_dir.mkdir(parents=True, exist_ok=True)
        index_dir.mkdir(parents=True, exist_ok=True)

        _IMPORT_JOBS.append_message(job_id, "Parsing watch history")
        _IMPORT_JOBS.set_progress(job_id, 10.0)
        entries = parse_watch_history(takeout_path)
        if not entries:
            raise HTTPException(
                status_code=400,
                detail="No watch entries found in the provided takeout file.",
            )

        _IMPORT_JOBS.append_message(job_id, f"Parsed {len(entries)} entries")
        _IMPORT_JOBS.set_progress(job_id, 15.0)
        csv_out = data_dir / "youtube_watch_history.csv"
        write_csv(entries, csv_out)
        _IMPORT_JOBS.append_message(job_id, f"Wrote CSV to {csv_out}")
        _IMPORT_JOBS.set_progress(job_id, _EMBEDDING_PHASE_START_PROGRESS)

        indexed_entries = 0
        if not skip_index:
            _IMPORT_JOBS.append_message(job_id, "Preparing documents for indexing")
            existing_video_ids = get_indexed_video_ids(index_dir)
            docs = to_llama_documents(
                entries,
                youtube_data_api_key=youtube_data_api_key,
                exclude_video_ids=existing_video_ids,
            )
            skipped_count = max(len({entry.video_id for entry in entries}) - len(docs), 0)
            if skipped_count > 0:
                _IMPORT_JOBS.append_message(
                    job_id,
                    (
                        "Skipping already indexed videos by video_id: "
                        f"{skipped_count}"
                    ),
                )
            if not docs:
                _IMPORT_JOBS.append_message(
                    job_id, "No new videos to index. Existing embeddings are up to date."
                )
                indexed_entries = 0
                _IMPORT_JOBS.set_progress(job_id, 99.0)
            else:
                _IMPORT_JOBS.append_message(
                    job_id, f"Prepared {len(docs)} documents. Starting embeddings."
                )
                _IMPORT_JOBS.set_progress(job_id, _EMBEDDING_PHASE_START_PROGRESS)
                embedding_progress = _EmbeddingProgressTracker(expected_items=len(docs))
                announced_batches = False

                def _on_backend_progress(message: str) -> None:
                    normalized = message.strip()
                    if not normalized:
                        return
                    _IMPORT_JOBS.append_message(job_id, normalized)
                    progress = embedding_progress.progress_from_message(normalized)
                    if progress is not None:
                        _IMPORT_JOBS.set_progress(job_id, progress)
                    nonlocal announced_batches
                    if not announced_batches and "Generating embeddings:" in normalized:
                        expected_batches = embedding_progress.expected_batches()
                        if expected_batches is not None:
                            _IMPORT_JOBS.append_message(
                                job_id,
                                (
                                    "Estimated embedding batches: "
                                    f"{expected_batches} (based on {len(docs)} documents)."
                                ),
                            )
                            announced_batches = True

                progress_stream = _ProgressStream(_on_backend_progress)
                with redirect_stderr(progress_stream):
                    indexed_entries = ingest_documents(docs, index_dir=index_dir)
                progress_stream.flush()
                _IMPORT_JOBS.append_message(job_id, "Indexing completed")
                _IMPORT_JOBS.set_progress(job_id, 99.0)

        result = ImportTakeoutResponse(
            parsed_entries=len(entries),
            indexed_entries=indexed_entries,
            csv_out=str(csv_out),
            index_dir=str(index_dir),
        )
        _IMPORT_JOBS.append_message(job_id, "Import completed")
        _IMPORT_JOBS.complete(job_id, result)
    except HTTPException as exc:
        detail = exc.detail
        if isinstance(detail, dict) and "message" in detail:
            error = ImportErrorDetail(
                message=str(detail.get("message")),
                stack_trace=(
                    str(detail.get("stack_trace"))
                    if detail.get("stack_trace") is not None
                    else None
                ),
            )
        else:
            error = ImportErrorDetail(
                message=str(detail),
                stack_trace="".join(traceback.format_exception(exc)),
            )
        _IMPORT_JOBS.append_message(job_id, f"Import failed: {error.message}")
        _IMPORT_JOBS.fail(job_id, error)
    except Exception as exc:
        logger.exception("Unhandled import job error")
        error = ImportErrorDetail(
            message=f"Import failed unexpectedly: {exc}",
            stack_trace="".join(traceback.format_exception(exc)),
        )
        _IMPORT_JOBS.append_message(job_id, f"Import failed: {error.message}")
        _IMPORT_JOBS.fail(job_id, error)
    finally:
        try:
            os.remove(takeout_path)
        except OSError:
            pass


def _frontend_dist_dir() -> Path:
    candidates = [
        Path("frontend/dist"),
        Path(__file__).resolve().parents[2] / "frontend" / "dist",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


@app.on_event("startup")
def on_startup() -> None:
    def _warmup_worker() -> None:
        started = time.perf_counter()
        logger.info("timing startup.warmup start index_dir=%s", DEFAULT_INDEX_DIR)
        if not index_ready(DEFAULT_INDEX_DIR):
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info(
                "timing startup.warmup skipped elapsed_ms=%.2f reason=no_index",
                elapsed_ms,
            )
            return
        try:
            warmup(index_dir=DEFAULT_INDEX_DIR)
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info("timing startup.warmup done elapsed_ms=%.2f", elapsed_ms)
        except Exception:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.exception("Startup warmup failed elapsed_ms=%.2f", elapsed_ms)

    thread = Thread(target=_warmup_worker, daemon=True)
    thread.start()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/settings", response_model=SettingsResponse)
def get_settings_api_endpoint() -> SettingsResponse:
    started = time.perf_counter()
    settings = load_settings()
    llm_router = settings["llm_router"]
    response = SettingsResponse(
        llm_router=llm_router,
        llm_router_options=list(LLM_ROUTER_OPTIONS),
        youtube_data_api_key=settings["youtube_data_api_key"],
        score_threshold=settings["score_threshold"],
        llm_router_cli_warning=_llm_router_cli_warning(llm_router),
    )
    elapsed_ms = (time.perf_counter() - started) * 1000
    logger.info("timing api.settings elapsed_ms=%.2f", elapsed_ms)
    return response


@app.put("/api/settings", response_model=SettingsResponse)
def update_settings_api_endpoint(payload: UpdateSettingsRequest) -> SettingsResponse:
    current_settings = load_settings()
    updates = payload.model_dump(exclude_unset=True)

    selected_router = current_settings["llm_router"]
    if "llm_router" in updates:
        selected_router = updates["llm_router"]
    elif "llm_backend" in updates:
        selected_router = updates["llm_backend"]

    youtube_data_api_key = current_settings["youtube_data_api_key"]
    if "youtube_data_api_key" in updates:
        youtube_data_api_key = updates["youtube_data_api_key"]
        if isinstance(youtube_data_api_key, str) and youtube_data_api_key.strip():
            try:
                validate_youtube_api_key(youtube_data_api_key)
            except RuntimeError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
    score_threshold = current_settings["score_threshold"]
    if "score_threshold" in updates and updates["score_threshold"] is not None:
        score_threshold = updates["score_threshold"]

    settings = save_settings(
        llm_router=selected_router,
        youtube_data_api_key=youtube_data_api_key,
        score_threshold=score_threshold,
    )
    llm_router = settings["llm_router"]
    return SettingsResponse(
        llm_router=llm_router,
        llm_router_options=list(LLM_ROUTER_OPTIONS),
        youtube_data_api_key=settings["youtube_data_api_key"],
        score_threshold=settings["score_threshold"],
        llm_router_cli_warning=_llm_router_cli_warning(llm_router),
    )


@app.post("/api/validate-youtube-api-key", response_model=ValidateYouTubeApiKeyResponse)
def validate_youtube_api_key_api_endpoint(
    payload: ValidateYouTubeApiKeyRequest,
) -> ValidateYouTubeApiKeyResponse:
    key_candidate = payload.youtube_data_api_key
    if not isinstance(key_candidate, str) or not key_candidate.strip():
        return ValidateYouTubeApiKeyResponse(
            valid=True,
            message="",
        )

    try:
        validate_youtube_api_key(key_candidate)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=400,
            detail=ImportErrorDetail(
                message=str(exc),
                stack_trace="".join(traceback.format_exception(exc)),
            ).model_dump(),
        ) from exc

    return ValidateYouTubeApiKeyResponse(
        valid=True,
        message="YouTube Data API key is valid.",
    )


@app.get("/api/index-status", response_model=IndexStatusResponse)
def index_status_api_endpoint(
    index_dir: str = str(DEFAULT_INDEX_DIR),
) -> IndexStatusResponse:
    started = time.perf_counter()
    index_path = Path(index_dir)
    ready = index_ready(index_path)
    elapsed_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "timing api.index-status elapsed_ms=%.2f index_ready=%s index_dir=%s",
        elapsed_ms,
        ready,
        index_path,
    )
    return IndexStatusResponse(index_ready=ready, index_dir=str(index_path))


@app.get("/api/search", response_model=SearchResponse)
def search_api_endpoint(
    q: str,
    score_threshold: float | None = None,
    index_dir: str = str(DEFAULT_INDEX_DIR),
) -> SearchResponse:
    settings = load_settings()
    llm_router = settings["llm_router"]
    effective_score_threshold = (
        settings["score_threshold"]
        if score_threshold is None
        else score_threshold
    )
    effective_query = q
    static_filters: dict[str, str] = {}
    errors: list[str] = []
    time_filter: str | None = None
    if llm_router is not None:
        try:
            routed = rewrite_prompt_with_router(
                llm_router=llm_router,
                user_query=q,
            )
            effective_query = routed.new_prompt
            static_filters = routed.static_filters
            errors.extend(routed.errors)
            time_filter = static_filters.get("time")
        except LLMRouterError as exc:
            errors.append(str(exc))

    try:
        hits = search(
            query=effective_query,
            index_dir=Path(index_dir),
            score_threshold=effective_score_threshold,
            time_filter=time_filter,
        )
    except ValueError as exc:
        if time_filter is not None:
            errors.append(f"Ignoring unsupported time filter `{time_filter}`: {exc}")
            static_filters.pop("time", None)
            time_filter = None
            hits = search(
                query=effective_query,
                index_dir=Path(index_dir),
                score_threshold=effective_score_threshold,
                time_filter=None,
            )
        else:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload = [
        SearchResponseItem(
            score=hit.score,
            file_path=hit.file_path,
            text=hit.text,
            video_id=hit.video_id,
            video_url=hit.video_url,
            title=hit.title,
            channel_name=hit.channel_name,
            channel_url=hit.channel_url,
            channel_logo_url=hit.channel_logo_url,
            published_at=hit.published_at,
            view_count=hit.view_count,
        )
        for hit in hits
    ]
    return SearchResponse(
        query=effective_query,
        original_query=q,
        static_filters=static_filters,
        errors=errors,
        results=payload,
    )


@app.post("/api/init", response_model=InitResponse)
def init_api_endpoint(
    index_dir: str = str(DEFAULT_INDEX_DIR),
    data_dir: str = "dev_assets/data",
) -> InitResponse:
    index_path = Path(index_dir)
    data_path = Path(data_dir)
    index_path.mkdir(parents=True, exist_ok=True)
    data_path.mkdir(parents=True, exist_ok=True)
    return InitResponse(index_dir=str(index_path), data_dir=str(data_path))


@app.post("/api/import-takeout", response_model=ImportTakeoutResponse)
async def import_takeout_api_endpoint(
    file: UploadFile = File(...),
    index_dir: str = Form(str(DEFAULT_INDEX_DIR)),
    data_dir: str = Form("dev_assets/data"),
    skip_index: bool = Form(False),
) -> ImportTakeoutResponse:
    file_name = Path(file.filename or "watch-history.html").name
    file_suffix = Path(file_name).suffix.lower()
    if file_suffix not in {".html", ".htm", ".json"}:
        raise HTTPException(
            status_code=400,
            detail=ImportErrorDetail(
                message="Expected a .html/.htm/.json takeout file",
                stack_trace=None,
            ).model_dump(),
        )

    data_path = Path(data_dir)
    index_path = Path(index_dir)

    with tempfile.NamedTemporaryFile(suffix=file_suffix or ".tmp", delete=False) as tmp:
        temp_file_path = Path(tmp.name)
        content = await file.read()
        tmp.write(content)

    try:
        return _run_import_from_takeout_path(
            takeout_path=temp_file_path,
            index_dir=index_path,
            data_dir=data_path,
            skip_index=skip_index,
            youtube_data_api_key=resolve_youtube_data_api_key(
                load_settings()["youtube_data_api_key"]
            ),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled import-takeout error")
        raise HTTPException(
            status_code=500,
            detail=ImportErrorDetail(
                message=f"Import failed unexpectedly: {exc}",
                stack_trace="".join(traceback.format_exception(exc)),
            ).model_dump(),
        ) from exc
    finally:
        try:
            os.remove(temp_file_path)
        except OSError:
            pass


@app.post("/api/import-takeout-jobs", response_model=ImportTakeoutJobCreateResponse)
async def import_takeout_job_create_api_endpoint(
    file: UploadFile = File(...),
    index_dir: str = Form(str(DEFAULT_INDEX_DIR)),
    data_dir: str = Form("dev_assets/data"),
    skip_index: bool = Form(False),
) -> ImportTakeoutJobCreateResponse:
    file_name = Path(file.filename or "watch-history.html").name
    file_suffix = Path(file_name).suffix.lower()
    if file_suffix not in {".html", ".htm", ".json"}:
        raise HTTPException(
            status_code=400,
            detail=ImportErrorDetail(
                message="Expected a .html/.htm/.json takeout file",
                stack_trace=None,
            ).model_dump(),
        )

    with tempfile.NamedTemporaryFile(suffix=file_suffix or ".tmp", delete=False) as tmp:
        temp_file_path = Path(tmp.name)
        content = await file.read()
        tmp.write(content)

    job = _IMPORT_JOBS.create_job()
    worker = Thread(
        target=_run_import_job,
        kwargs={
            "job_id": job.job_id,
            "takeout_path": temp_file_path,
            "index_dir": Path(index_dir),
            "data_dir": Path(data_dir),
            "skip_index": skip_index,
            "youtube_data_api_key": resolve_youtube_data_api_key(
                load_settings()["youtube_data_api_key"]
            ),
        },
        daemon=True,
    )
    worker.start()
    return ImportTakeoutJobCreateResponse(job_id=job.job_id, status=job.status)


@app.get(
    "/api/import-takeout-jobs/{job_id}",
    response_model=ImportTakeoutJobStatusResponse,
)
def import_takeout_job_status_api_endpoint(job_id: str) -> ImportTakeoutJobStatusResponse:
    snapshot = _IMPORT_JOBS.snapshot(job_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Import job not found")
    return snapshot


@app.post("/api/validate-takeout", response_model=ValidateTakeoutResponse)
async def validate_takeout_api_endpoint(
    file: UploadFile = File(...),
    index_dir: str = Form(str(DEFAULT_INDEX_DIR)),
) -> ValidateTakeoutResponse:
    file_name = Path(file.filename or "watch-history.html").name
    file_suffix = Path(file_name).suffix.lower()
    if file_suffix not in {".html", ".htm", ".json"}:
        raise HTTPException(
            status_code=400,
            detail=ImportErrorDetail(
                message="Expected a .html/.htm/.json takeout file",
                stack_trace=None,
            ).model_dump(),
        )

    with tempfile.NamedTemporaryFile(suffix=file_suffix or ".tmp", delete=False) as tmp:
        temp_file_path = Path(tmp.name)
        content = await file.read()
        tmp.write(content)

    try:
        entries = parse_watch_history(temp_file_path)
        deduped_entries = dedupe_entries_by_video_id(entries)
        existing_video_ids = get_indexed_video_ids(Path(index_dir))
        new_entries = sum(
            1 for entry in deduped_entries if entry.video_id not in existing_video_ids
        )
        already_indexed_entries = len(deduped_entries) - new_entries
        return ValidateTakeoutResponse(
            parsed_entries=len(entries),
            deduped_entries=len(deduped_entries),
            new_entries=new_entries,
            already_indexed_entries=already_indexed_entries,
        )
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=400,
            detail=ImportErrorDetail(
                message=str(exc),
                stack_trace="".join(traceback.format_exception(exc)),
            ).model_dump(),
        ) from exc
    except Exception as exc:
        logger.exception("Unhandled validate-takeout error")
        raise HTTPException(
            status_code=500,
            detail=ImportErrorDetail(
                message=f"Validation failed unexpectedly: {exc}",
                stack_trace="".join(traceback.format_exception(exc)),
            ).model_dump(),
        ) from exc
    finally:
        try:
            os.remove(temp_file_path)
        except OSError:
            pass


@app.post("/api/import-takeout-path", response_model=ImportTakeoutResponse)
def import_takeout_path_api_endpoint(
    payload: ImportTakeoutPathRequest,
) -> ImportTakeoutResponse:
    takeout_path = payload.takeout_path or payload.html_path
    if not takeout_path:
        raise HTTPException(
            status_code=400,
            detail=ImportErrorDetail(
                message="Expected `takeout_path` (or legacy `html_path`) in request body.",
                stack_trace=None,
            ).model_dump(),
        )
    current_settings = load_settings()
    try:
        return _run_import_from_takeout_path(
            takeout_path=Path(takeout_path),
            index_dir=Path(payload.index_dir),
            data_dir=Path(payload.data_dir),
            skip_index=payload.skip_index,
            youtube_data_api_key=resolve_youtube_data_api_key(
                current_settings["youtube_data_api_key"]
            ),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled import-takeout-path error")
        raise HTTPException(
            status_code=500,
            detail=ImportErrorDetail(
                message=f"Import failed unexpectedly: {exc}",
                stack_trace="".join(traceback.format_exception(exc)),
            ).model_dump(),
        ) from exc


@app.get("/search")
def search_endpoint(
    q: str,
    score_threshold: float | None = None,
    index_dir: str = str(DEFAULT_INDEX_DIR),
) -> SearchResponse:
    return search_api_endpoint(
        q=q,
        score_threshold=score_threshold,
        index_dir=index_dir,
    )


_DIST_DIR = _frontend_dist_dir()
_ASSETS_DIR = _DIST_DIR / "assets"

if _ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="assets")


@app.get("/{full_path:path}")
def frontend_app(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")

    index_file = _DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(
        status_code=404,
        detail="Frontend build not found. Run `pnpm build` in ./frontend.",
    )
