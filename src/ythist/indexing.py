from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Event, Lock
from typing import Iterable, Literal

from llama_index.core import (
    Document,
    Settings,
    StorageContext,
    VectorStoreIndex,
    load_index_from_storage,
)
from llama_index.embeddings.fastembed import FastEmbedEmbedding
from llama_index.core.vector_stores.types import (
    FilterOperator,
    MetadataFilter,
    MetadataFilters,
)

DEFAULT_INDEX_DIR = Path("dev_assets/index")
DEFAULT_EMBED_MODEL = "BAAI/bge-small-en-v1.5"
DEFAULT_SCORE_THRESHOLD = 0.7
DEFAULT_RETRIEVAL_CANDIDATE_K = 50
BackendDriver = Literal["auto", "cpu", "cuda", "migraphx", "rocm", "directml"]
BACKEND_DRIVER_OPTIONS: tuple[BackendDriver, ...] = (
    "auto",
    "cpu",
    "cuda",
    "migraphx",
    "rocm",
    "directml",
)
_CACHE_LOCK = Lock()
_EMBED_MODELS: dict[tuple[str, tuple[str, ...] | None], FastEmbedEmbedding] = {}
_INDEXES: dict[tuple[str, str], VectorStoreIndex] = {}
_INDEX_LOAD_EVENTS: dict[tuple[str, str], Event] = {}
_INDEX_LOAD_ERRORS: dict[tuple[str, str], Exception] = {}
_INDEX_WRITE_LOCK = Lock()
_INDEX_MARKER_FILES = (
    "docstore.json",
    "index_store.json",
    "graph_store.json",
    "vector_store.json",
)
_TIME_EXPRESSION_RE = re.compile(r"^(>=|<=|>|<)\s*(.+)$")
_YEAR_RE = re.compile(r"^\d{4}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_BACKEND_DRIVER_PROVIDER_MAP: dict[BackendDriver, list[str] | None] = {
    "auto": None,
    "cpu": ["CPUExecutionProvider"],
    "cuda": ["CUDAExecutionProvider", "CPUExecutionProvider"],
    "migraphx": [
        "MIGraphXExecutionProvider",
        "ROCMExecutionProvider",
        "CPUExecutionProvider",
    ],
    "rocm": ["ROCMExecutionProvider", "CPUExecutionProvider"],
    "directml": ["DmlExecutionProvider", "CPUExecutionProvider"],
}
_BACKEND_DRIVER_LABELS: dict[BackendDriver, str] = {
    "auto": "Auto (recommended)",
    "cpu": "CPU only",
    "cuda": "NVIDIA CUDA",
    "migraphx": "AMD MIGraphX",
    "rocm": "AMD ROCm",
    "directml": "DirectML (Windows)",
}


@dataclass(frozen=True)
class SearchHit:
    score: float | None
    file_path: str
    text: str
    video_id: str | None
    video_url: str | None
    title: str | None
    channel_name: str | None
    channel_url: str | None
    channel_logo_url: str | None
    published_at: str | None
    view_count: str | None


@dataclass(frozen=True)
class TimeBounds:
    start: datetime
    end: datetime


def _parse_time_token(token: str, *, allow_date: bool = False) -> TimeBounds:
    value = token.strip()
    if not value:
        raise ValueError("Time filter value cannot be empty.")

    if _YEAR_RE.fullmatch(value):
        year = int(value)
        return TimeBounds(
            start=datetime(year, 1, 1, 0, 0, 0),
            end=datetime(year, 12, 31, 23, 59, 59),
        )

    if allow_date and _DATE_RE.fullmatch(value):
        year, month, day = value.split("-", maxsplit=2)
        try:
            return TimeBounds(
                start=datetime(int(year), int(month), int(day), 0, 0, 0),
                end=datetime(int(year), int(month), int(day), 23, 59, 59),
            )
        except ValueError as exc:
            raise ValueError(f"Invalid calendar date in time filter: `{value}`.") from exc

    raise ValueError(
        "Unsupported time filter format. Use one of: "
        "`YYYY`, `>=YYYY-MM-DD`, `<=YYYY-MM-DD`, or `YYYY-MM-DD..YYYY-MM-DD`."
    )


def _time_filter_to_metadata_filters(time_filter: str) -> MetadataFilters:
    expression = time_filter.strip()
    if not expression:
        raise ValueError("Time filter value cannot be empty.")

    if ".." in expression:
        lower_raw, upper_raw = expression.split("..", maxsplit=1)
        lower = _parse_time_token(lower_raw, allow_date=True).start
        upper = _parse_time_token(upper_raw, allow_date=True).end
        if lower > upper:
            raise ValueError("Time filter start is after end.")
        return MetadataFilters(
            filters=[
                MetadataFilter(
                    key="watched_at_iso",
                    value=lower.isoformat(),
                    operator=FilterOperator.GTE,
                ),
                MetadataFilter(
                    key="watched_at_iso",
                    value=upper.isoformat(),
                    operator=FilterOperator.LTE,
                ),
            ]
        )

    op_match = _TIME_EXPRESSION_RE.fullmatch(expression)
    if op_match:
        op_token, raw_value = op_match.groups()
        bounds = _parse_time_token(raw_value, allow_date=True)
        if op_token == ">=":
            operator = FilterOperator.GTE
            value = bounds.start.isoformat()
        elif op_token == "<=":
            operator = FilterOperator.LTE
            value = bounds.end.isoformat()
        elif op_token == ">":
            operator = FilterOperator.GT
            value = bounds.end.isoformat()
        else:
            operator = FilterOperator.LT
            value = bounds.start.isoformat()
        return MetadataFilters(
            filters=[MetadataFilter(key="watched_at_iso", value=value, operator=operator)]
        )

    bounds = _parse_time_token(expression)
    return MetadataFilters(
        filters=[
            MetadataFilter(
                key="watched_at_iso",
                value=bounds.start.isoformat(),
                operator=FilterOperator.GTE,
            ),
            MetadataFilter(
                key="watched_at_iso",
                value=bounds.end.isoformat(),
                operator=FilterOperator.LTE,
            ),
        ]
    )


def _set_embedding_model(
    model_name: str = DEFAULT_EMBED_MODEL,
    backend_driver: BackendDriver = "auto",
) -> None:
    providers = _resolve_embed_providers(backend_driver=backend_driver)
    cache_key = (model_name, tuple(providers) if providers else None)
    with _CACHE_LOCK:
        embed_model = _EMBED_MODELS.get(cache_key)
        if embed_model is None:
            embed_model = FastEmbedEmbedding(
                model_name=model_name,
                providers=providers,
            )
            _EMBED_MODELS[cache_key] = embed_model
    Settings.embed_model = embed_model


def _resolve_embed_providers(
    *,
    backend_driver: BackendDriver = "auto",
) -> list[str] | None:
    configured = _BACKEND_DRIVER_PROVIDER_MAP.get(backend_driver)
    if configured is not None:
        return list(configured)
    return None


def _resolve_available_onnx_providers() -> tuple[list[str], str | None]:
    try:
        import onnxruntime as ort
    except Exception as exc:
        return (["CPUExecutionProvider"], f"ONNX Runtime not importable: {exc}")

    try:
        providers = ort.get_available_providers()
    except Exception as exc:
        return (["CPUExecutionProvider"], f"Unable to query ONNX providers: {exc}")
    if not providers:
        return (["CPUExecutionProvider"], "No ONNX providers reported; using CPU fallback")
    return (list(providers), None)


def get_backend_driver_capabilities() -> dict[str, object]:
    available_providers, error = _resolve_available_onnx_providers()
    available_provider_set = set(available_providers)
    options: list[dict[str, str | bool | None]] = []
    for driver in BACKEND_DRIVER_OPTIONS:
        required_providers = _BACKEND_DRIVER_PROVIDER_MAP[driver]
        if required_providers is None:
            available = True
            detail = (
                "Uses automatic provider selection. Set explicit driver to force a provider."
            )
        else:
            first_provider = required_providers[0]
            available = first_provider in available_provider_set
            detail = (
                f"Requires `{first_provider}`."
                if not available
                else f"Detected `{first_provider}`."
            )
        options.append(
            {
                "value": driver,
                "label": _BACKEND_DRIVER_LABELS[driver],
                "available": available,
                "detail": detail,
            }
        )
    return {
        "available_providers": available_providers,
        "detection_error": error,
        "options": options,
    }


def _load_index(index_dir: Path) -> VectorStoreIndex:
    storage_context = StorageContext.from_defaults(persist_dir=str(index_dir))
    return load_index_from_storage(storage_context)


def _resolve_index_key(index_dir: Path, model_name: str) -> tuple[str, str]:
    return (str(index_dir.resolve()), model_name)


def _get_cached_index(index_dir: Path, model_name: str) -> VectorStoreIndex:
    key = _resolve_index_key(index_dir, model_name)
    with _CACHE_LOCK:
        cached = _INDEXES.get(key)
        if cached is not None:
            return cached

        load_event = _INDEX_LOAD_EVENTS.get(key)
        should_load = load_event is None
        if should_load:
            load_event = Event()
            _INDEX_LOAD_EVENTS[key] = load_event
            _INDEX_LOAD_ERRORS.pop(key, None)

    if should_load:
        try:
            loaded = _load_index(index_dir)
        except Exception as exc:
            with _CACHE_LOCK:
                _INDEX_LOAD_ERRORS[key] = exc
                _INDEX_LOAD_EVENTS.pop(key, None)
                load_event.set()
            raise

        with _CACHE_LOCK:
            cached = _INDEXES.setdefault(key, loaded)
            _INDEX_LOAD_ERRORS.pop(key, None)
            _INDEX_LOAD_EVENTS.pop(key, None)
            load_event.set()
            return cached

    load_event.wait()
    with _CACHE_LOCK:
        cached = _INDEXES.get(key)
        if cached is not None:
            return cached
        load_error = _INDEX_LOAD_ERRORS.get(key)

    if load_error is not None:
        raise load_error
    raise RuntimeError(f"Index load coordination failed for key: {key}")


def _invalidate_cached_index(index_dir: Path) -> None:
    resolved = str(index_dir.resolve())
    with _CACHE_LOCK:
        stale_keys = [key for key in _INDEXES if key[0] == resolved]
        for key in stale_keys:
            del _INDEXES[key]
            _INDEX_LOAD_ERRORS.pop(key, None)


def _extract_video_id_from_document(document: Document) -> str | None:
    metadata = document.metadata or {}
    raw_video_id = metadata.get("video_id")
    if not isinstance(raw_video_id, str):
        return None
    normalized = raw_video_id.strip()
    return normalized or None


def _collect_video_ids_from_json_value(
    value: object,
    *,
    output: set[str],
) -> None:
    if isinstance(value, dict):
        video_id = value.get("video_id")
        if isinstance(video_id, str):
            normalized = video_id.strip()
            if normalized:
                output.add(normalized)
        for nested in value.values():
            _collect_video_ids_from_json_value(nested, output=output)
        return
    if isinstance(value, list):
        for nested in value:
            _collect_video_ids_from_json_value(nested, output=output)


def _load_video_ids_from_docstore(index_dir: Path) -> set[str]:
    docstore_path = index_dir / "docstore.json"
    if not docstore_path.exists():
        return set()
    try:
        payload = json.loads(docstore_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()

    result: set[str] = set()
    _collect_video_ids_from_json_value(payload, output=result)
    return result


def _resolve_indexed_video_ids(index_dir: Path) -> set[str]:
    return _load_video_ids_from_docstore(index_dir)


def get_indexed_video_ids(index_dir: Path = DEFAULT_INDEX_DIR) -> set[str]:
    if not index_dir.exists() or not index_dir.is_dir():
        return set()
    with _INDEX_WRITE_LOCK:
        return _resolve_indexed_video_ids(index_dir)


def index_ready(index_dir: Path = DEFAULT_INDEX_DIR) -> bool:
    if not index_dir.exists() or not index_dir.is_dir():
        return False

    if any((index_dir / marker).exists() for marker in _INDEX_MARKER_FILES):
        return True

    return any(index_dir.iterdir())


def ingest_documents(
    documents: Iterable[Document],
    index_dir: Path = DEFAULT_INDEX_DIR,
    model_name: str = DEFAULT_EMBED_MODEL,
    backend_driver: BackendDriver = "auto",
) -> int:
    docs = list(documents)
    if not docs:
        return 0

    _set_embedding_model(model_name, backend_driver=backend_driver)
    index_dir.mkdir(parents=True, exist_ok=True)
    with _INDEX_WRITE_LOCK:
        indexed_video_ids = _resolve_indexed_video_ids(index_dir)
        docs_to_index: list[Document] = []
        for doc in docs:
            video_id = _extract_video_id_from_document(doc)
            if video_id is not None and video_id in indexed_video_ids:
                continue
            docs_to_index.append(doc)

        if not docs_to_index:
            return 0

        if index_ready(index_dir):
            index = _load_index(index_dir)
            for doc in docs_to_index:
                index.insert(doc)
        else:
            index = VectorStoreIndex.from_documents(docs_to_index, show_progress=True)

        index.storage_context.persist(persist_dir=str(index_dir))
        for doc in docs_to_index:
            video_id = _extract_video_id_from_document(doc)
            if video_id is not None:
                indexed_video_ids.add(video_id)
        _invalidate_cached_index(index_dir)
        return len(docs_to_index)


def search(
    query: str,
    index_dir: Path = DEFAULT_INDEX_DIR,
    model_name: str = DEFAULT_EMBED_MODEL,
    backend_driver: BackendDriver = "auto",
    score_threshold: float = DEFAULT_SCORE_THRESHOLD,
    retrieval_candidate_k: int = DEFAULT_RETRIEVAL_CANDIDATE_K,
    time_filter: str | None = None,
) -> list[SearchHit]:
    if not index_dir.exists():
        raise FileNotFoundError(
            f"Index directory not found: {index_dir}. Run import-takeout first."
        )

    _set_embedding_model(model_name, backend_driver=backend_driver)
    index = _get_cached_index(index_dir, model_name)
    metadata_filters = (
        _time_filter_to_metadata_filters(time_filter)
        if time_filter is not None
        else None
    )
    retriever = index.as_retriever(
        similarity_top_k=retrieval_candidate_k,
        filters=metadata_filters,
    )
    nodes = retriever.retrieve(query)

    hits: list[SearchHit] = []
    for node in nodes:
        score = node.score
        if score is None or score < score_threshold:
            continue
        metadata = node.metadata or {}
        file_path = str(
            metadata.get("file_path")
            or metadata.get("filename")
            or metadata.get("document_id")
            or "unknown"
        )
        hits.append(
            SearchHit(
                score=score,
                file_path=file_path,
                text=node.text,
                video_id=str(metadata["video_id"]) if metadata.get("video_id") else None,
                video_url=str(metadata["video_url"]) if metadata.get("video_url") else None,
                title=str(metadata["title"]) if metadata.get("title") else None,
                channel_name=(
                    str(metadata["channel_name"]) if metadata.get("channel_name") else None
                ),
                channel_url=(
                    str(metadata["channel_url"]) if metadata.get("channel_url") else None
                ),
                channel_logo_url=(
                    str(metadata["channel_logo_url"])
                    if metadata.get("channel_logo_url")
                    else None
                ),
                published_at=(
                    str(metadata["published_at"]) if metadata.get("published_at") else None
                ),
                view_count=str(metadata["view_count"]) if metadata.get("view_count") else None,
            )
        )
    return hits


def warmup(
    index_dir: Path = DEFAULT_INDEX_DIR,
    model_name: str = DEFAULT_EMBED_MODEL,
    backend_driver: BackendDriver = "auto",
) -> bool:
    """Warm embedding and, when available, preload the persisted index."""
    _set_embedding_model(model_name, backend_driver=backend_driver)
    if not index_dir.exists():
        return False

    _get_cached_index(index_dir, model_name)
    return True
