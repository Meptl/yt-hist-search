from __future__ import annotations

import csv
import html
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from llama_index.core import Document
from ythist.youtube_metadata import fetch_video_metadata_map

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
    if cleaned.endswith("Z"):
        cleaned = f"{cleaned[:-1]}+00:00"
    try:
        return datetime.fromisoformat(cleaned).isoformat()
    except ValueError:
        pass
    for fmt in ("%b %d, %Y, %I:%M:%S %p %Z", "%b %d, %Y, %I:%M:%S %p"):
        try:
            return datetime.strptime(cleaned, fmt).isoformat()
        except ValueError:
            continue
    return None


def parse_watch_history_html(html_path: Path) -> list[WatchEntry]:
    content = html_path.read_text(encoding="utf-8", errors="ignore")
    chunks = ENTRY_RE.findall(content)

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


def parse_watch_history_json(json_path: Path) -> list[WatchEntry]:
    content = json_path.read_text(encoding="utf-8", errors="ignore")
    payload = json.loads(content)
    if not isinstance(payload, list):
        return []

    results: list[WatchEntry] = []
    for item in payload:
        if not isinstance(item, dict):
            continue

        video_url_value = item.get("titleUrl")
        video_url = video_url_value.strip() if isinstance(video_url_value, str) else ""
        video_id = _extract_video_id(video_url)
        if not video_id:
            continue

        title_value = item.get("title")
        title = title_value.strip() if isinstance(title_value, str) else ""
        if title.startswith("Watched "):
            title = title[len("Watched ") :].strip()
        title = _decode_html_entities(title)

        channel_name = ""
        channel_url = ""
        subtitles = item.get("subtitles")
        if isinstance(subtitles, list) and subtitles:
            first_subtitle = subtitles[0]
            if isinstance(first_subtitle, dict):
                name_value = first_subtitle.get("name")
                url_value = first_subtitle.get("url")
                channel_name = name_value.strip() if isinstance(name_value, str) else ""
                channel_url = url_value.strip() if isinstance(url_value, str) else ""

        watched_time_value = item.get("time")
        watched_at_raw = (
            _normalize_whitespace(watched_time_value)
            if isinstance(watched_time_value, str)
            else ""
        )
        watched_at_iso = _parse_datetime(watched_at_raw)

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


def parse_watch_history(takeout_path: Path) -> list[WatchEntry]:
    suffix = takeout_path.suffix.lower()
    if suffix in {".html", ".htm"}:
        return parse_watch_history_html(takeout_path)
    if suffix == ".json":
        return parse_watch_history_json(takeout_path)
    raise ValueError(
        f"Unsupported takeout file extension: {takeout_path.suffix}. "
        "Expected .html, .htm, or .json."
    )


def to_llama_documents(
    entries: list[WatchEntry],
    *,
    youtube_data_api_key: str | None = None,
) -> list[Document]:
    deduped_entries = dedupe_entries_by_video_id(entries)
    metadata_by_video_id = (
        fetch_video_metadata_map(
            api_key=youtube_data_api_key,
            video_ids=[entry.video_id for entry in deduped_entries],
        )
        if youtube_data_api_key
        else {}
    )
    docs: list[Document] = []
    for entry in deduped_entries:
        video_metadata = metadata_by_video_id.get(entry.video_id)
        tags = list(video_metadata.tags) if video_metadata is not None else []
        topic_categories = (
            list(video_metadata.topic_categories) if video_metadata is not None else []
        )
        description = (
            video_metadata.description.strip()
            if video_metadata is not None and video_metadata.description
            else ""
        )
        text_lines = [
            f"Title: {entry.title}",
            f"Channel: {entry.channel_name}",
        ]
        if description:
            text_lines.append(f"Description: {description}")
        if tags:
            text_lines.append(f"Tags: {', '.join(tags)}")
        if topic_categories:
            text_lines.append(f"Topic Categories: {', '.join(topic_categories)}")
        text = "\n".join(text_lines)
        published_at = (
            video_metadata.published_at if video_metadata is not None else None
        )
        view_count = video_metadata.view_count if video_metadata is not None else None
        channel_logo_url = (
            video_metadata.channel_logo_url if video_metadata is not None else None
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
                    "watchedAt": entry.watched_at_iso,
                    "publishedAt": published_at,
                    "statistics.viewCount": view_count,
                    "watched_at_raw": entry.watched_at_raw,
                    "watched_at_iso": entry.watched_at_iso,
                    "published_at": published_at,
                    "view_count": view_count,
                    "channel_logo_url": channel_logo_url,
                },
            )
        )
    return docs


def dedupe_entries_by_video_id(entries: list[WatchEntry]) -> list[WatchEntry]:
    seen_video_ids: set[str] = set()
    deduped: list[WatchEntry] = []
    for entry in entries:
        if entry.video_id in seen_video_ids:
            continue
        deduped.append(entry)
        seen_video_ids.add(entry.video_id)
    return deduped


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
