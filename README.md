# yt-hist

Local desktop app for importing YouTube history from Google Takeout, indexing it, and running semantic retrieval through a local API + React UI.

This repository uses:
- FastAPI backend (`src/ythist/api.py`)
- React + Vite frontend (`frontend/`)
- Electron desktop shell (`electron/main.cjs`)
- Local persistent index under `dev_assets/index`

## Install

```bash
uv venv
source .venv/bin/activate
uv pip install -e .
pnpm install
pnpm --dir frontend install
```

## Run desktop app (recommended)

Development mode:

```bash
pnpm dev
```

Production-style local run:

```bash
pnpm build:frontend
pnpm start
```

## Run backend API directly

```bash
PYTHONPATH=src uv run python -m uvicorn ythist.api:app --host 127.0.0.1 --port 8000
```

Key endpoints:
- `GET /health`
- `GET /api/index-status`
- `POST /api/import-takeout-jobs`
- `GET /api/import-takeout-jobs/{job_id}`
- `GET /api/search`
- `GET /api/settings`
- `PUT /api/settings`

## Frontend-only dev (optional)

```bash
cd frontend
pnpm dev
```

This expects the backend to already be running at `127.0.0.1:8000`.

## Notes

- Embeddings use FastEmbed model `BAAI/bge-small-en-v1.5`.
- First run may download embedding model files.
- Importing Takeout writes CSV to `dev_assets/data/youtube_watch_history.csv` and updates `dev_assets/index`.
