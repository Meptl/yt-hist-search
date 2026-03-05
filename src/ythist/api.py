from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ythist.indexing import DEFAULT_INDEX_DIR, search

app = FastAPI(title="yt-hist", version="0.1.0")


class SearchResponseItem(BaseModel):
    score: float | None
    file_path: str
    text: str


def _frontend_dist_dir() -> Path:
    candidates = [
        Path("frontend/dist"),
        Path(__file__).resolve().parents[2] / "frontend" / "dist",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/search")
def search_api_endpoint(
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


@app.get("/search")
def search_endpoint(
    q: str,
    top_k: int = 5,
    index_dir: str = str(DEFAULT_INDEX_DIR),
) -> dict[str, list[SearchResponseItem] | str]:
    return search_api_endpoint(q=q, top_k=top_k, index_dir=index_dir)


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
