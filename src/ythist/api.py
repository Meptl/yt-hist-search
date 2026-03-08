from __future__ import annotations

import os
import tempfile
import logging
import shutil
from pathlib import Path
from threading import Thread

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Literal

from ythist.indexing import (
    DEFAULT_INDEX_DIR,
    DEFAULT_SCORE_THRESHOLD,
    index_ready,
    ingest_documents,
    search,
    warmup,
)
from ythist.takeout import (
    parse_watch_history_html,
    to_llama_documents,
    write_csv,
)
from ythist.settings import (
    LLM_ROUTER_OPTIONS,
    load_settings,
    save_settings,
    settings_path,
)

app = FastAPI(title="yt-hist", version="0.1.0")
logger = logging.getLogger(__name__)


class SearchResponseItem(BaseModel):
    score: float | None
    file_path: str
    text: str
    video_id: str | None = None
    video_url: str | None = None


class InitResponse(BaseModel):
    index_dir: str
    data_dir: str


class ImportTakeoutResponse(BaseModel):
    parsed_entries: int
    indexed_entries: int
    csv_out: str
    index_dir: str


class ImportTakeoutPathRequest(BaseModel):
    html_path: str
    index_dir: str = str(DEFAULT_INDEX_DIR)
    data_dir: str = "dev_assets/data"
    skip_index: bool = False


class IndexStatusResponse(BaseModel):
    index_ready: bool
    index_dir: str


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
    settings_path: str
    llm_router_cli_warning: str | None = None


class UpdateSettingsRequest(BaseModel):
    llm_router: LLMRouter | None = None
    llm_backend: LLMRouter | None = None


def _llm_router_cli_warning(llm_router: LLMRouter | None) -> str | None:
    if llm_router is None:
        return None

    cli_command = LLM_ROUTER_CLI_COMMANDS[llm_router]
    if shutil.which(cli_command) is not None:
        return None

    return (
        f"`{cli_command}` CLI was not found in PATH. Install it or add it to PATH "
        "to use this LLM Router."
    )


def _run_import_from_html_path(
    html_path: Path,
    index_dir: Path,
    data_dir: Path,
    skip_index: bool,
) -> ImportTakeoutResponse:
    if not html_path.exists() or not html_path.is_file():
        raise HTTPException(status_code=400, detail=f"File not found: {html_path}")
    if html_path.suffix.lower() not in {".html", ".htm"}:
        raise HTTPException(status_code=400, detail="Expected a .html/.htm takeout file")

    data_dir.mkdir(parents=True, exist_ok=True)
    index_dir.mkdir(parents=True, exist_ok=True)

    entries = parse_watch_history_html(html_path)
    if not entries:
        raise HTTPException(
            status_code=400,
            detail="No watch entries found in the provided takeout file.",
        )

    csv_out = data_dir / "youtube_watch_history.csv"
    write_csv(entries, csv_out)

    indexed_entries = 0
    if not skip_index:
        docs = to_llama_documents(entries)
        try:
            indexed_entries = ingest_documents(docs, index_dir=index_dir)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Indexing failed. Ensure internet access is available once for "
                    f"embedding model download. Original error: {exc}"
                ),
            ) from exc

    return ImportTakeoutResponse(
        parsed_entries=len(entries),
        indexed_entries=indexed_entries,
        csv_out=str(csv_out),
        index_dir=str(index_dir),
    )


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
        try:
            warmup(index_dir=DEFAULT_INDEX_DIR)
        except Exception:
            logger.exception("Startup warmup failed")

    thread = Thread(target=_warmup_worker, daemon=True)
    thread.start()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/settings", response_model=SettingsResponse)
def get_settings_api_endpoint() -> SettingsResponse:
    settings = load_settings()
    llm_router = settings["llm_router"]
    return SettingsResponse(
        llm_router=llm_router,
        llm_router_options=list(LLM_ROUTER_OPTIONS),
        settings_path=str(settings_path()),
        llm_router_cli_warning=_llm_router_cli_warning(llm_router),
    )


@app.put("/api/settings", response_model=SettingsResponse)
def update_settings_api_endpoint(payload: UpdateSettingsRequest) -> SettingsResponse:
    selected_router = payload.llm_router if payload.llm_router is not None else payload.llm_backend
    settings = save_settings(llm_router=selected_router)
    llm_router = settings["llm_router"]
    return SettingsResponse(
        llm_router=llm_router,
        llm_router_options=list(LLM_ROUTER_OPTIONS),
        settings_path=str(settings_path()),
        llm_router_cli_warning=_llm_router_cli_warning(llm_router),
    )


@app.get("/api/index-status", response_model=IndexStatusResponse)
def index_status_api_endpoint(
    index_dir: str = str(DEFAULT_INDEX_DIR),
) -> IndexStatusResponse:
    index_path = Path(index_dir)
    return IndexStatusResponse(index_ready=index_ready(index_path), index_dir=str(index_path))


@app.get("/api/search")
def search_api_endpoint(
    q: str,
    score_threshold: float = DEFAULT_SCORE_THRESHOLD,
    index_dir: str = str(DEFAULT_INDEX_DIR),
) -> dict[str, list[SearchResponseItem] | str]:
    try:
        hits = search(
            query=q,
            index_dir=Path(index_dir),
            score_threshold=score_threshold,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload = [
        SearchResponseItem(
            score=hit.score,
            file_path=hit.file_path,
            text=hit.text,
            video_id=hit.video_id,
            video_url=hit.video_url,
        )
        for hit in hits
    ]
    return {"query": q, "results": payload}


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
    if not file_name.lower().endswith((".html", ".htm")):
        raise HTTPException(status_code=400, detail="Expected a .html/.htm takeout file")

    data_path = Path(data_dir)
    index_path = Path(index_dir)

    with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as tmp:
        temp_file_path = Path(tmp.name)
        content = await file.read()
        tmp.write(content)

    try:
        return _run_import_from_html_path(
            html_path=temp_file_path,
            index_dir=index_path,
            data_dir=data_path,
            skip_index=skip_index,
        )
    finally:
        try:
            os.remove(temp_file_path)
        except OSError:
            pass


@app.post("/api/import-takeout-path", response_model=ImportTakeoutResponse)
def import_takeout_path_api_endpoint(
    payload: ImportTakeoutPathRequest,
) -> ImportTakeoutResponse:
    return _run_import_from_html_path(
        html_path=Path(payload.html_path),
        index_dir=Path(payload.index_dir),
        data_dir=Path(payload.data_dir),
        skip_index=payload.skip_index,
    )


@app.get("/search")
def search_endpoint(
    q: str,
    score_threshold: float = DEFAULT_SCORE_THRESHOLD,
    index_dir: str = str(DEFAULT_INDEX_DIR),
) -> dict[str, list[SearchResponseItem] | str]:
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
