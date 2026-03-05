from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Iterable

from llama_index.core import (
    Document,
    Settings,
    StorageContext,
    VectorStoreIndex,
    load_index_from_storage,
)
from llama_index.embeddings.fastembed import FastEmbedEmbedding

DEFAULT_INDEX_DIR = Path("dev_assets/index")
DEFAULT_EMBED_MODEL = "BAAI/bge-small-en-v1.5"
_CACHE_LOCK = Lock()
_EMBED_MODELS: dict[str, FastEmbedEmbedding] = {}
_INDEXES: dict[tuple[str, str], VectorStoreIndex] = {}


@dataclass(frozen=True)
class SearchHit:
    score: float | None
    file_path: str
    text: str


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

    loaded = _load_index(index_dir)
    with _CACHE_LOCK:
        return _INDEXES.setdefault(key, loaded)


def _invalidate_cached_index(index_dir: Path) -> None:
    resolved = str(index_dir.resolve())
    with _CACHE_LOCK:
        stale_keys = [key for key in _INDEXES if key[0] == resolved]
        for key in stale_keys:
            del _INDEXES[key]


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
    top_k: int = 5,
) -> list[SearchHit]:
    if not index_dir.exists():
        raise FileNotFoundError(
            f"Index directory not found: {index_dir}. Run import-takeout first."
        )

    _set_embedding_model(model_name)
    index = _get_cached_index(index_dir, model_name)
    retriever = index.as_retriever(similarity_top_k=top_k)
    nodes = retriever.retrieve(query)

    hits: list[SearchHit] = []
    for node in nodes:
        metadata = node.metadata or {}
        file_path = str(
            metadata.get("file_path")
            or metadata.get("filename")
            or metadata.get("document_id")
            or "unknown"
        )
        hits.append(
            SearchHit(
                score=node.score,
                file_path=file_path,
                text=node.text,
            )
        )
    return hits
