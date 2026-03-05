from __future__ import annotations

import os
import tempfile
from pathlib import Path
from threading import Thread

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ythist.indexing import (
    DEFAULT_INDEX_DIR,
    ingest_documents,
    search,
    warmup,
)
from ythist.takeout import (
    parse_watch_history_html,
    to_llama_documents,
    write_csv,
)

app = FastAPI(title="yt-hist", version="0.1.0")


class SearchResponseItem(BaseModel):
    score: float | None
    file_path: str
    text: str


class InitResponse(BaseModel):
    index_dir: str
    data_dir: str


class ImportTakeoutResponse(BaseModel):
    parsed_entries: int
    indexed_entries: int
    csv_out: str
    index_dir: str


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
    thread = Thread(
        target=warmup,
        kwargs={"index_dir": DEFAULT_INDEX_DIR},
        daemon=True,
    )
    thread.start()


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
    if not file_name.lower().endswith(".html"):
        raise HTTPException(status_code=400, detail="Expected a .html takeout file")

    data_path = Path(data_dir)
    data_path.mkdir(parents=True, exist_ok=True)
    index_path = Path(index_dir)
    index_path.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as tmp:
        temp_file_path = Path(tmp.name)
        content = await file.read()
        tmp.write(content)

    try:
        entries = parse_watch_history_html(temp_file_path)
        if not entries:
            raise HTTPException(
                status_code=400,
                detail="No watch entries found in uploaded takeout file.",
            )

        csv_out = data_path / "youtube_watch_history.csv"
        write_csv(entries, csv_out)

        indexed_entries = 0
        if not skip_index:
            docs = to_llama_documents(entries)
            try:
                indexed_entries = ingest_documents(docs, index_dir=index_path)
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
            index_dir=str(index_path),
        )
    finally:
        try:
            os.remove(temp_file_path)
        except OSError:
            pass


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
