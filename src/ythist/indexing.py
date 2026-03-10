from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Event, Lock
from typing import Iterable

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
_CACHE_LOCK = Lock()
_EMBED_MODELS: dict[str, FastEmbedEmbedding] = {}
_INDEXES: dict[tuple[str, str], VectorStoreIndex] = {}
_INDEX_LOAD_EVENTS: dict[tuple[str, str], Event] = {}
_INDEX_LOAD_ERRORS: dict[tuple[str, str], Exception] = {}
_INDEX_MARKER_FILES = (
    "docstore.json",
    "index_store.json",
    "graph_store.json",
    "vector_store.json",
)
_TIME_EXPRESSION_RE = re.compile(r"^(>=|<=|>|<)\s*(.+)$")
_YEAR_RE = re.compile(r"^\d{4}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


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


def _set_embedding_model(model_name: str = DEFAULT_EMBED_MODEL) -> None:
    with _CACHE_LOCK:
        embed_model = _EMBED_MODELS.get(model_name)
        if embed_model is None:
            embed_model = FastEmbedEmbedding(model_name=model_name)
            _EMBED_MODELS[model_name] = embed_model
    Settings.embed_model = embed_model


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
) -> int:
    docs = list(documents)
    if not docs:
        raise ValueError("No documents were provided for indexing.")

    _set_embedding_model(model_name)
    index = VectorStoreIndex.from_documents(docs, show_progress=True)
    index_dir.mkdir(parents=True, exist_ok=True)
    index.storage_context.persist(persist_dir=str(index_dir))
    _invalidate_cached_index(index_dir)
    return len(docs)


def search(
    query: str,
    index_dir: Path = DEFAULT_INDEX_DIR,
    model_name: str = DEFAULT_EMBED_MODEL,
    score_threshold: float = DEFAULT_SCORE_THRESHOLD,
    retrieval_candidate_k: int = DEFAULT_RETRIEVAL_CANDIDATE_K,
    time_filter: str | None = None,
) -> list[SearchHit]:
    if not index_dir.exists():
        raise FileNotFoundError(
            f"Index directory not found: {index_dir}. Run import-takeout first."
        )

    _set_embedding_model(model_name)
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
) -> bool:
    """Warm embedding and, when available, preload the persisted index."""
    _set_embedding_model(model_name)
    if not index_dir.exists():
        return False

    _get_cached_index(index_dir, model_name)
    return True
