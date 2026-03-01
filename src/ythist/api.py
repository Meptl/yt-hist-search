from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from ythist.indexing import DEFAULT_INDEX_DIR, ingest_directory, search

app = FastAPI(title="yt-hist", version="0.1.0")


class IngestRequest(BaseModel):
    data_dir: str = Field(..., description="Directory containing dataset files")
    index_dir: str = Field(
        default=str(DEFAULT_INDEX_DIR),
        description="Directory where LlamaIndex persistence files are stored",
    )
    recursive: bool = True


class SearchResponseItem(BaseModel):
    score: float | None
    file_path: str
    text: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ingest")
def ingest(req: IngestRequest) -> dict[str, int | str]:
    try:
        count = ingest_directory(
            data_dir=Path(req.data_dir),
            index_dir=Path(req.index_dir),
            recursive=req.recursive,
        )
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "documents_indexed": count, "index_dir": req.index_dir}


@app.get("/search")
def search_endpoint(
    q: str,
    top_k: int = 5,
    index_dir: str = str(DEFAULT_INDEX_DIR),
) -> dict[str, list[SearchResponseItem] | str]:
    try:
        hits = search(query=q, index_dir=Path(index_dir), top_k=top_k)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload = [
        SearchResponseItem(score=hit.score, file_path=hit.file_path, text=hit.text)
        for hit in hits
    ]
    return {"query": q, "results": payload}
