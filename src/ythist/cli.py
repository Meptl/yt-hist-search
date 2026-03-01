from __future__ import annotations

import argparse
from pathlib import Path

import uvicorn

from ythist.indexing import DEFAULT_INDEX_DIR, ingest_directory, ingest_documents, search
from ythist.takeout import (
    parse_watch_history_html,
    to_llama_documents,
    write_csv,
    write_jsonl,
)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ythist",
        description="Local semantic retrieval over YouTube history exports",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    init_cmd = sub.add_parser("init", help="Create local app directories")
    init_cmd.add_argument("--index-dir", default=str(DEFAULT_INDEX_DIR))
    init_cmd.add_argument("--data-dir", default="dev_assets/data")

    ingest_cmd = sub.add_parser("ingest", help="Ingest documents into local index")
    ingest_cmd.add_argument("data_dir", help="Path to dataset directory")
    ingest_cmd.add_argument("--index-dir", default=str(DEFAULT_INDEX_DIR))
    ingest_cmd.add_argument("--recursive", action="store_true", default=True)
    ingest_cmd.add_argument(
        "--no-recursive", dest="recursive", action="store_false"
    )

    import_takeout_cmd = sub.add_parser(
        "import-takeout",
        help="Parse Google Takeout watch-history.html and index entries",
    )
    import_takeout_cmd.add_argument("html_path", help="Path to watch-history.html")
    import_takeout_cmd.add_argument("--index-dir", default=str(DEFAULT_INDEX_DIR))
    import_takeout_cmd.add_argument(
        "--csv-out", default="dev_assets/data/youtube_watch_history.csv"
    )
    import_takeout_cmd.add_argument(
        "--jsonl-out", default="dev_assets/data/youtube_watch_history.jsonl"
    )
    import_takeout_cmd.add_argument(
        "--skip-index",
        action="store_true",
        help="Only export CSV/JSONL and do not build vector index",
    )

    search_cmd = sub.add_parser("search", help="Run semantic search")
    search_cmd.add_argument("query", help="Natural language search query")
    search_cmd.add_argument("--index-dir", default=str(DEFAULT_INDEX_DIR))
    search_cmd.add_argument("--top-k", type=int, default=5)

    serve_cmd = sub.add_parser("serve", help="Start local FastAPI server")
    serve_cmd.add_argument("--host", default="127.0.0.1")
    serve_cmd.add_argument("--port", type=int, default=8000)

    return parser


def _cmd_init(args: argparse.Namespace) -> None:
    Path(args.index_dir).mkdir(parents=True, exist_ok=True)
    Path(args.data_dir).mkdir(parents=True, exist_ok=True)
    print(f"Initialized directories:\n- {args.index_dir}\n- {args.data_dir}")


def _cmd_ingest(args: argparse.Namespace) -> None:
    count = ingest_directory(
        data_dir=Path(args.data_dir),
        index_dir=Path(args.index_dir),
        recursive=args.recursive,
    )
    print(f"Indexed {count} documents into {args.index_dir}")


def _cmd_search(args: argparse.Namespace) -> None:
    hits = search(
        query=args.query,
        index_dir=Path(args.index_dir),
        top_k=args.top_k,
    )
    if not hits:
        print("No matches found.")
        return

    for idx, hit in enumerate(hits, start=1):
        score = f"{hit.score:.4f}" if hit.score is not None else "n/a"
        preview = " ".join(hit.text.split())
        if len(preview) > 280:
            preview = f"{preview[:280]}..."
        print(f"[{idx}] score={score} file={hit.file_path}\n{preview}\n")


def _cmd_import_takeout(args: argparse.Namespace) -> None:
    html_path = Path(args.html_path)
    entries = parse_watch_history_html(html_path)
    if not entries:
        raise ValueError(f"No watch entries found in {html_path}")

    csv_out = Path(args.csv_out)
    jsonl_out = Path(args.jsonl_out)
    write_csv(entries, csv_out)
    write_jsonl(entries, jsonl_out)

    print(f"Parsed {len(entries)} entries from {html_path}")
    print(f"Wrote CSV: {csv_out}")
    print(f"Wrote JSONL: {jsonl_out}")

    if args.skip_index:
        return

    docs = to_llama_documents(entries)
    try:
        indexed = ingest_documents(docs, index_dir=Path(args.index_dir))
    except Exception as exc:
        raise RuntimeError(
            "Indexing failed. If this is your first run, ensure internet access is "
            "available once so FastEmbed can download its model files. "
            f"Original error: {exc}"
        ) from exc
    print(f"Indexed {indexed} entries into {args.index_dir}")


def _cmd_serve(args: argparse.Namespace) -> None:
    uvicorn.run("ythist.api:app", host=args.host, port=args.port, reload=False)


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "init":
        _cmd_init(args)
    elif args.command == "ingest":
        _cmd_ingest(args)
    elif args.command == "search":
        _cmd_search(args)
    elif args.command == "import-takeout":
        _cmd_import_takeout(args)
    elif args.command == "serve":
        _cmd_serve(args)
    else:
        parser.error(f"Unknown command: {args.command}")
