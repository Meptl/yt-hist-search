# yt-hist

App for searching Youtube watch history with semantic retrieval.


## Development

```bash
pnpm dev
```

### Electron
```
pnpm build:electron
# See ./dist-electron/
```

## Notes

- Embeddings use FastEmbed model `BAAI/bge-small-en-v1.5`.
- First run may download embedding model files.
- Importing Takeout writes CSV to `dev_assets/data/youtube_watch_history.csv` and updates `dev_assets/index`.
