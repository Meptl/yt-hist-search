# yt-hist (LlamaIndex bootstrap)

This repo is initialized as a local LlamaIndex app with:
- CLI for `init`, `import-takeout`, `search`, `serve`
- FastAPI server (`/health`, `/search`, `/api/search`)
- React + Vite frontend in `frontend/` (served by FastAPI after build)
- Local persistent index under `dev_assets/index`

The implementation follows LlamaIndex usage from:
- https://github.com/run-llama/llama_index
- https://docs.llamaindex.ai

## 1. Install

```bash
uv venv
source .venv/bin/activate
uv pip install -e .
```

## 2. Initialize local folders

```bash
ythist init
```

## 3. Import Google Takeout watch history

```bash
ythist import-takeout watch-history.html
```

This command:
- Parses every watched video entry from Takeout HTML
- Writes CSV to `dev_assets/data/youtube_watch_history.csv`
- Builds the vector index in `dev_assets/index`

If you only want CSV export without indexing:

```bash
ythist import-takeout watch-history.html --skip-index
```

## 4. Semantic search

```bash
ythist search "videos about RAG and vectors" --top-k 5
```

## 5. Run local API server

```bash
ythist serve --host 127.0.0.1 --port 8000
```

Then use:

```bash
curl http://127.0.0.1:8000/health
curl "http://127.0.0.1:8000/search?q=python%20videos&top_k=5"
curl "http://127.0.0.1:8000/api/search?q=python%20videos&top_k=5"
```

## 6. Frontend setup

Install frontend dependencies:

```bash
cd frontend
pnpm install
```

Run frontend dev server (proxies API calls to `127.0.0.1:8000`):

```bash
pnpm dev
```

Build frontend for local FastAPI serving:

```bash
pnpm build
```

After build, run `ythist serve` and open:

```text
http://127.0.0.1:8000
```

## Notes

- Embeddings use `FastEmbed` with model `BAAI/bge-small-en-v1.5`.
- The first run downloads embedding model files (one-time internet access required).
- Re-running `import-takeout` rebuilds the persisted index in `dev_assets/index`.
