from __future__ import annotations

import base64
import codecs
import json
from pathlib import Path
from typing import Literal

from ythist.youtube_string_blob import BLOB_FILENAME, youtube_string_slice

LLMRouter = Literal["codex", "claude", "gemini", "opencode"]
LLM_ROUTER_OPTIONS: tuple[LLMRouter, ...] = ("codex", "claude", "gemini", "opencode")
BackendDriver = Literal["auto", "cpu", "cuda", "migraphx", "rocm", "directml"]
BACKEND_DRIVER_OPTIONS: tuple[BackendDriver, ...] = (
    "auto",
    "cpu",
    "cuda",
    "migraphx",
    "rocm",
    "directml",
)

_DEFAULT_YOUTUBE_STRING_BLOB_PATH = Path(__file__).resolve().parent / "assets" / BLOB_FILENAME

_SETTINGS_DIR = Path.home() / ".local" / "share" / "ythist"
_SETTINGS_PATH = _SETTINGS_DIR / "settings.json"
_DEFAULT_YOUTUBE_STRING_CACHE: str | None = None


def get_default_youtube_string() -> str:
    global _DEFAULT_YOUTUBE_STRING_CACHE
    if isinstance(_DEFAULT_YOUTUBE_STRING_CACHE, str):
        return _DEFAULT_YOUTUBE_STRING_CACHE

    # This is intentionally lightweight obfuscation to avoid simplistic
    # auto-detection; it is not intended as strong secret protection.
    start, payload_size = youtube_string_slice()
    if start < 0 or payload_size <= 0:
        raise RuntimeError("Invalid default YouTube string slice metadata.")

    blob = _DEFAULT_YOUTUBE_STRING_BLOB_PATH.read_bytes()
    end = start + payload_size
    if end > len(blob):
        raise RuntimeError("Default YouTube string slice extends beyond blob length.")

    rot13_payload = blob[start:end].decode("ascii")
    base64_payload = codecs.encode(rot13_payload, "rot_13")
    default_youtube_string = base64.b64decode(
        base64_payload.encode("ascii"), validate=True
    ).decode("utf-8")
    _DEFAULT_YOUTUBE_STRING_CACHE = default_youtube_string
    return default_youtube_string


def default_settings() -> dict[str, LLMRouter | BackendDriver | str | float | None]:
    return {
        "llm_router": None,
        "backend_driver": "auto",
        # Keep settings payload empty when no custom YouTube string is set.
        "youtube_data_string": None,
        "score_threshold": 0.7,
    }


def _normalize_router(value: object) -> LLMRouter | None:
    if isinstance(value, str) and value in LLM_ROUTER_OPTIONS:
        return value
    return None


def _normalize_youtube_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_backend_driver(value: object) -> BackendDriver:
    if isinstance(value, str) and value in BACKEND_DRIVER_OPTIONS:
        return value
    return "auto"


def _normalize_stored_youtube_string(value: object) -> str | None:
    # User-supplied YouTube strings are never obfuscated/decoded here.
    normalized = _normalize_youtube_string(value)
    if normalized == get_default_youtube_string():
        return None
    return normalized


def resolve_youtube_data_string(configured_youtube_string: str | None) -> str:
    normalized_configured = _normalize_stored_youtube_string(configured_youtube_string)
    if normalized_configured is not None:
        return normalized_configured

    return get_default_youtube_string()


def _normalize_score_threshold(value: object) -> float:
    if isinstance(value, bool):
        return 0.7
    try:
        normalized = float(value)
    except (TypeError, ValueError):
        return 0.7
    if normalized < 0 or normalized > 1:
        return 0.7
    return normalized


def load_settings() -> dict[str, LLMRouter | BackendDriver | str | float | None]:
    defaults = default_settings()
    try:
        raw_text = _SETTINGS_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        return defaults
    except OSError:
        return defaults

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError:
        return defaults

    if not isinstance(payload, dict):
        return defaults

    router_value = payload.get("llm_router")
    if router_value is None:
        # Backward-compat: load existing settings written with the old key.
        router_value = payload.get("llm_backend")
    youtube_string_value = payload.get("youtube_data_string")
    normalized_youtube_string = _normalize_stored_youtube_string(youtube_string_value)
    fallback_youtube_string = defaults["youtube_data_string"]
    score_threshold_value = payload.get("score_threshold")
    backend_driver_value = payload.get("backend_driver")
    return {
        "llm_router": _normalize_router(router_value),
        "backend_driver": _normalize_backend_driver(backend_driver_value),
        "youtube_data_string": (
            normalized_youtube_string
            if normalized_youtube_string is not None
            else (
                fallback_youtube_string
                if isinstance(fallback_youtube_string, str)
                else None
            )
        ),
        "score_threshold": _normalize_score_threshold(score_threshold_value),
    }


def save_settings(
    *,
    llm_router: LLMRouter | None,
    backend_driver: BackendDriver,
    youtube_data_string: str | None,
    score_threshold: float,
) -> dict[str, LLMRouter | BackendDriver | str | float | None]:
    settings = {
        "llm_router": _normalize_router(llm_router),
        "backend_driver": _normalize_backend_driver(backend_driver),
        "youtube_data_string": _normalize_stored_youtube_string(youtube_data_string),
        "score_threshold": _normalize_score_threshold(score_threshold),
    }

    _SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = _SETTINGS_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(_SETTINGS_PATH)

    return settings
