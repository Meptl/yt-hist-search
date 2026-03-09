from __future__ import annotations

import csv
import html
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from llama_index.core import Document

ENTRY_RE = re.compile(
    r'<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">'
    r"(.*?)</div>"
)
WATCHED_RE = re.compile(
    r"Watched\s*<a href=\"(?P<url>https://www\.youtube\.com/watch\?v=[^\"]+)\""
    r">(?P<title>.*?)</a><br>"
    r"<a href=\"(?P<channel_url>https://www\.youtube\.com/channel/[^\"]+)\""
    r">(?P<channel>.*?)</a><br>"
    r"(?P<watched_at>[^<]+)<br>"
)
TAG_RE = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class WatchEntry:
    video_id: str
    video_url: str
    title: str
    channel_name: str
    channel_url: str
    watched_at_raw: str
    watched_at_iso: str | None


def _strip_tags(value: str) -> str:
    return TAG_RE.sub("", value).strip()


def _normalize_whitespace(value: str) -> str:
    return (
        value.replace("\u00a0", " ")
        .replace("\u202f", " ")
        .replace("&nbsp;", " ")
        .strip()
    )


def _decode_html_entities(value: str) -> str:
    return html.unescape(value)


def _extract_video_id(url: str) -> str:
    query = parse_qs(urlparse(url).query)
    return query.get("v", [""])[0]


def _parse_datetime(raw_value: str) -> str | None:
    cleaned = _normalize_whitespace(raw_value)
    for fmt in ("%b %d, %Y, %I:%M:%S %p %Z", "%b %d, %Y, %I:%M:%S %p"):
        try:
            return datetime.strptime(cleaned, fmt).isoformat()
        except ValueError:
            continue
    return None


def parse_watch_history_html(html_path: Path) -> list[WatchEntry]:
    html = html_path.read_text(encoding="utf-8", errors="ignore")
    chunks = ENTRY_RE.findall(html)

    results: list[WatchEntry] = []
    for chunk in chunks:
        match = WATCHED_RE.search(chunk)
        if not match:
            continue

        video_url = match.group("url").strip()
        title = _decode_html_entities(_strip_tags(match.group("title")))
        channel_name = _decode_html_entities(_strip_tags(match.group("channel")))
        channel_url = match.group("channel_url").strip()
        watched_at_raw = _normalize_whitespace(_strip_tags(match.group("watched_at")))
        watched_at_iso = _parse_datetime(watched_at_raw)
        video_id = _extract_video_id(video_url)
        if not video_id:
            continue

        results.append(
            WatchEntry(
                video_id=video_id,
                video_url=video_url,
                title=title,
                channel_name=channel_name,
                channel_url=channel_url,
                watched_at_raw=watched_at_raw,
                watched_at_iso=watched_at_iso,
            )
        )
    return results


def to_llama_documents(entries: list[WatchEntry]) -> list[Document]:
    docs: list[Document] = []
    for entry in entries:
        text = "\n".join(
            [
                f"Title: {entry.title}",
                f"Channel: {entry.channel_name}",
                f"Watched At: {entry.watched_at_raw}",
                f"Video URL: {entry.video_url}",
            ]
        )
        docs.append(
            Document(
                text=text,
                doc_id=f"yt:{entry.video_id}:{entry.watched_at_raw}",
                metadata={
                    "video_id": entry.video_id,
                    "video_url": entry.video_url,
                    "title": entry.title,
                    "channel_name": entry.channel_name,
                    "channel_url": entry.channel_url,
                    "watched_at_raw": entry.watched_at_raw,
                    "watched_at_iso": entry.watched_at_iso,
                },
            )
        )
    return docs


def write_csv(entries: list[WatchEntry], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "video_id",
                "video_url",
                "title",
                "channel_name",
                "channel_url",
                "watched_at_raw",
                "watched_at_iso",
            ],
        )
        writer.writeheader()
        for row in entries:
            writer.writerow(row.__dict__)
