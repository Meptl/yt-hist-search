from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from ythist.indexing import DEFAULT_INDEX_DIR, search

app = FastAPI(title="yt-hist", version="0.1.0")


class SearchResponseItem(BaseModel):
    score: float | None
    file_path: str
    text: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

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
