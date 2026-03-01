# yt-hist (LlamaIndex bootstrap)

This repo is initialized as a local LlamaIndex app with:
- CLI for `init`, `ingest`, `search`, `serve`
- CLI for `import-takeout` (Google Takeout `watch-history.html` parser)
- FastAPI server (`/health`, `/ingest`, `/search`)
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

## 3. Put your dataset in a directory

Example:

```bash
mkdir -p dev_assets/data/demo
cat > dev_assets/data/demo/sample.txt <<'EOF'
I watched several videos about Python, vector databases, and retrieval augmented generation.
EOF
```

Or point directly to your real dataset directory.

## 4. Build index

```bash
ythist ingest dev_assets/data
```

## 4b. Import Google Takeout watch history directly

```bash
ythist import-takeout watch-history.html
```

This command:
- Parses every watched video entry from Takeout HTML
- Writes CSV to `dev_assets/data/youtube_watch_history.csv`
- Writes JSONL to `dev_assets/data/youtube_watch_history.jsonl`
- Builds the vector index in `dev_assets/index`

If you only want CSV/JSONL export without indexing:

```bash
ythist import-takeout watch-history.html --skip-index
```

## 5. Semantic search

```bash
ythist search "videos about RAG and vectors" --top-k 5
```

## 6. Run local API server

```bash
ythist serve --host 127.0.0.1 --port 8000
```

Then use:

```bash
curl http://127.0.0.1:8000/health
curl "http://127.0.0.1:8000/search?q=python%20videos&top_k=5"
curl -X POST http://127.0.0.1:8000/ingest \
  -H 'Content-Type: application/json' \
  -d '{"data_dir":"dev_assets/data","index_dir":"dev_assets/index","recursive":true}'
```

## Notes

- Embeddings use `FastEmbed` with model `BAAI/bge-small-en-v1.5`.
- The first run downloads embedding model files (one-time internet access required).
- Re-running `ingest` rebuilds the persisted index in `dev_assets/index`.
