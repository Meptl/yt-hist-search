from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.parse import unquote, urlparse

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

YOUTUBE_VIDEOS_PARTS = ("snippet", "topicDetails", "statistics")
YOUTUBE_CHANNELS_PARTS = ("snippet",)
_MAX_VIDEO_IDS_PER_REQUEST = 50
_MAX_CHANNEL_IDS_PER_REQUEST = 50
_KEY_VALIDATION_VIDEO_ID = "dQw4w9WgXcQ"


@dataclass(frozen=True)
class YouTubeVideoMetadata:
    video_id: str
    description: str
    tags: tuple[str, ...]
    topic_categories: tuple[str, ...]
    published_at: str | None
    view_count: str | None
    channel_logo_url: str | None


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


def _http_error_message(exc: HttpError) -> str:
    content = getattr(exc, "content", b"")
    if isinstance(content, bytes) and content:
        try:
            payload = json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return str(exc)
        error_payload = payload.get("error")
        if isinstance(error_payload, dict):
            message = error_payload.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
    return str(exc)


def validate_youtube_api_key(api_key: str) -> None:
    normalized_api_key = api_key.strip()
    if not normalized_api_key:
        raise RuntimeError("YouTube Data API key is empty.")

    youtube_client = _build_youtube_client(normalized_api_key)
    request = youtube_client.videos().list(
        id=_KEY_VALIDATION_VIDEO_ID,
        part="id",
    )
    try:
        request.execute(num_retries=0)
    except HttpError as exc:
        message = _http_error_message(exc)
        raise RuntimeError(f"YouTube Data API key validation failed: {message}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"YouTube Data API returned invalid JSON: {exc}") from exc


def _fetch_videos_payload(youtube_client, video_ids: list[str]) -> dict:
    request = youtube_client.videos().list(
        id=",".join(video_ids),
        part=",".join(YOUTUBE_VIDEOS_PARTS),
    )
    return request.execute(num_retries=2)


def _fetch_channels_payload(youtube_client, channel_ids: list[str]) -> dict:
    request = youtube_client.channels().list(
        id=",".join(channel_ids),
        part=",".join(YOUTUBE_CHANNELS_PARTS),
    )
    return request.execute(num_retries=2)


def _extract_best_thumbnail_url(thumbnails: object) -> str | None:
    if not isinstance(thumbnails, dict):
        return None
    for key in ("maxres", "high", "medium", "standard", "default"):
        candidate = thumbnails.get(key)
        if not isinstance(candidate, dict):
            continue
        candidate_url = candidate.get("url")
        if isinstance(candidate_url, str) and candidate_url.strip():
            return candidate_url.strip()
    return None


def _fetch_channel_logo_map(youtube_client, channel_ids: list[str]) -> dict[str, str]:
    unique_channel_ids = sorted(
        {channel_id.strip() for channel_id in channel_ids if channel_id.strip()}
    )
    if not unique_channel_ids:
        return {}

    results: dict[str, str] = {}
    for ids_batch in _chunk(unique_channel_ids, _MAX_CHANNEL_IDS_PER_REQUEST):
        try:
            payload = _fetch_channels_payload(
                youtube_client=youtube_client, channel_ids=ids_batch
            )
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
            channel_id = item.get("id")
            if not isinstance(channel_id, str) or not channel_id:
                continue

            snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
            logo_url = _extract_best_thumbnail_url(snippet.get("thumbnails"))
            if logo_url:
                results[channel_id] = logo_url

    return results


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
    channel_ids: set[str] = set()
    video_channel_ids: dict[str, str] = {}
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
            channel_id = snippet.get("channelId")
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
            if isinstance(channel_id, str) and channel_id.strip():
                normalized_channel_id = channel_id.strip()
                channel_ids.add(normalized_channel_id)
                video_channel_ids[video_id] = normalized_channel_id
            results[video_id] = YouTubeVideoMetadata(
                video_id=video_id,
                description=description.strip() if isinstance(description, str) else "",
                tags=tags,
                topic_categories=topic_categories,
                published_at=published_at if isinstance(published_at, str) else None,
                view_count=view_count if isinstance(view_count, str) else None,
                channel_logo_url=None,
            )

    channel_logo_by_id = _fetch_channel_logo_map(
        youtube_client=youtube_client,
        channel_ids=sorted(channel_ids),
    )
    if not channel_logo_by_id:
        return results

    hydrated_results: dict[str, YouTubeVideoMetadata] = {}
    for video_id, metadata in results.items():
        channel_id = video_channel_ids.get(video_id)
        hydrated_results[video_id] = YouTubeVideoMetadata(
            video_id=metadata.video_id,
            description=metadata.description,
            tags=metadata.tags,
            topic_categories=metadata.topic_categories,
            published_at=metadata.published_at,
            view_count=metadata.view_count,
            channel_logo_url=channel_logo_by_id.get(channel_id) if channel_id else None,
        )
    return hydrated_results
