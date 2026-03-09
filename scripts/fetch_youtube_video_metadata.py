#!/usr/bin/env python3
"""Fetch and print YouTube metadata for a single video ID.

Usage:
  YOUTUBE_API_KEY=... python scripts/fetch_youtube_video_metadata.py
  YOUTUBE_API_KEY=... python scripts/fetch_youtube_video_metadata.py --video-id dQw4w9WgXcQ
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/videos"
DEFAULT_VIDEO_ID = "dQw4w9WgXcQ"
DEFAULT_PARTS = (
    "id,snippet,contentDetails,statistics,status,"
    "topicDetails,recordingDetails,liveStreamingDetails,localizations"
)


def fetch_video_metadata(api_key: str, video_id: str, parts: str) -> dict:
    query = urlencode({"id": video_id, "part": parts, "key": api_key})
    url = f"{YOUTUBE_API_URL}?{query}"

    with urlopen(url, timeout=30) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch metadata for a YouTube video with videos.list."
    )
    parser.add_argument(
        "--video-id",
        default=DEFAULT_VIDEO_ID,
        help=f"YouTube video ID to fetch (default: {DEFAULT_VIDEO_ID})",
    )
    parser.add_argument(
        "--parts",
        default=DEFAULT_PARTS,
        help=(
            "Comma-separated parts for videos.list. "
            f"Default: {DEFAULT_PARTS}"
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_key = os.getenv("YOUTUBE_API_KEY")

    if not api_key:
        print(
            "Missing YOUTUBE_API_KEY. Set it and run again, e.g.\n"
            "  YOUTUBE_API_KEY=your_key python scripts/fetch_youtube_video_metadata.py",
            file=sys.stderr,
        )
        return 1

    try:
        payload = fetch_video_metadata(
            api_key=api_key,
            video_id=args.video_id,
            parts=args.parts,
        )
    except HTTPError as exc:
        error_text = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP error {exc.code}: {error_text}", file=sys.stderr)
        return 2
    except URLError as exc:
        print(f"Network error: {exc}", file=sys.stderr)
        return 3
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON from API: {exc}", file=sys.stderr)
        return 4

    print(json.dumps(payload, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
