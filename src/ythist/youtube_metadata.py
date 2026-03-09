from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.parse import unquote, urlparse

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

YOUTUBE_VIDEOS_PARTS = ("snippet", "topicDetails", "statistics")
_MAX_VIDEO_IDS_PER_REQUEST = 50


@dataclass(frozen=True)
class YouTubeVideoMetadata:
    video_id: str
    description: str
    tags: tuple[str, ...]
    topic_categories: tuple[str, ...]
    published_at: str | None
    view_count: str | None


def _chunk(values: list[str], size: int) -> list[list[str]]:
    return [values[idx : idx + size] for idx in range(0, len(values), size)]


def _normalize_topic_category(topic_category_url: str) -> str | None:
    if not topic_category_url:
        return None

    parsed = urlparse(topic_category_url)
    raw_path = parsed.path or ""
    if not raw_path:
        return None
    last_segment = raw_path.rsplit("/", maxsplit=1)[-1]
    if not last_segment:
        return None

    normalized = unquote(last_segment).replace("_", " ").strip()
    return normalized or None


def _build_youtube_client(api_key: str):
    return build(
        serviceName="youtube",
        version="v3",
        developerKey=api_key,
        cache_discovery=False,
    )


def _fetch_videos_payload(youtube_client, video_ids: list[str]) -> dict:
    request = youtube_client.videos().list(
        id=",".join(video_ids),
        part=",".join(YOUTUBE_VIDEOS_PARTS),
    )
    return request.execute(num_retries=2)


def fetch_video_metadata_map(
    *,
    api_key: str,
    video_ids: list[str],
) -> dict[str, YouTubeVideoMetadata]:
    unique_video_ids = sorted({video_id.strip() for video_id in video_ids if video_id.strip()})
    if not unique_video_ids:
        return {}

    youtube_client = _build_youtube_client(api_key)
    results: dict[str, YouTubeVideoMetadata] = {}
    for ids_batch in _chunk(unique_video_ids, _MAX_VIDEO_IDS_PER_REQUEST):
        try:
            payload = _fetch_videos_payload(youtube_client=youtube_client, video_ids=ids_batch)
        except HttpError as exc:
            raise RuntimeError(f"YouTube Data API HTTP error: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"YouTube Data API returned invalid JSON: {exc}") from exc

        items = payload.get("items")
        if not isinstance(items, list):
            continue

        for item in items:
            if not isinstance(item, dict):
                continue
            video_id = item.get("id")
            if not isinstance(video_id, str) or not video_id:
                continue

            snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
            topic_details = (
                item.get("topicDetails")
                if isinstance(item.get("topicDetails"), dict)
                else {}
            )
            statistics = (
                item.get("statistics")
                if isinstance(item.get("statistics"), dict)
                else {}
            )

            description = snippet.get("description")
            published_at = snippet.get("publishedAt")
            tags_raw = snippet.get("tags")
            topic_categories_raw = topic_details.get("topicCategories")
            view_count = statistics.get("viewCount")

            tags = tuple(
                tag.strip()
                for tag in (tags_raw if isinstance(tags_raw, list) else [])
                if isinstance(tag, str) and tag.strip()
            )
            topic_categories = tuple(
                normalized
                for normalized in (
                    _normalize_topic_category(value)
                    for value in (
                        topic_categories_raw
                        if isinstance(topic_categories_raw, list)
                        else []
                    )
                )
                if normalized is not None
            )
            results[video_id] = YouTubeVideoMetadata(
                video_id=video_id,
                description=description.strip() if isinstance(description, str) else "",
                tags=tags,
                topic_categories=topic_categories,
                published_at=published_at if isinstance(published_at, str) else None,
                view_count=view_count if isinstance(view_count, str) else None,
            )

    return results
