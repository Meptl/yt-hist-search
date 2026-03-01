from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
from pathlib import Path

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


@dataclass(frozen=True)
class SearchHit:
    score: float | None
    file_path: str
    text: str


def _set_embedding_model(model_name: str = DEFAULT_EMBED_MODEL) -> None:
    Settings.embed_model = FastEmbedEmbedding(model_name=model_name)


def _load_index(index_dir: Path) -> VectorStoreIndex:
    storage_context = StorageContext.from_defaults(persist_dir=str(index_dir))
    return load_index_from_storage(storage_context)


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
    index = _load_index(index_dir)
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
