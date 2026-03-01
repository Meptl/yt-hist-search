This repository looks to create a local application that imports YouTube history from Google Takeout and supports:
- semantic search (vector retrieval)
- RAG answers grounded in the user history
- browser-based UI backed by the local service

## 2. Runtime Model
Single local process with two interfaces:
- CLI commands for import/index/query/admin
- Local HTTP server for web UI and API
Recommended stack:
- Backend: Python + FastAPI
- Storage: SQLite
- UI: React + Vite served by local backend


Do not write tests unless explicitly requested
