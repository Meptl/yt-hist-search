from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

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
_DEFAULT_YOUTUBE_DATA_API_KEY = "AIzaSyBzL4F2Uq9Qd44U8W4KjYNa0EoePeq5XP8"

_SETTINGS_DIR = Path.home() / ".local" / "share" / "ythist"
_SETTINGS_PATH = _SETTINGS_DIR / "settings.json"


def default_settings() -> dict[str, LLMRouter | BackendDriver | str | float | None]:
    return {
        "llm_router": None,
        "backend_driver": "auto",
        # Keep settings payload empty when no custom key is set.
        "youtube_data_api_key": None,
        "score_threshold": 0.7,
    }


def _normalize_router(value: object) -> LLMRouter | None:
    if isinstance(value, str) and value in LLM_ROUTER_OPTIONS:
        return value
    return None


def _normalize_api_key(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_backend_driver(value: object) -> BackendDriver:
    if isinstance(value, str) and value in BACKEND_DRIVER_OPTIONS:
        return value
    return "auto"


def _normalize_stored_api_key(value: object) -> str | None:
    normalized = _normalize_api_key(value)
    if normalized == _DEFAULT_YOUTUBE_DATA_API_KEY:
        return None
    return normalized


def resolve_youtube_data_api_key(configured_api_key: str | None) -> str:
    normalized_configured = _normalize_stored_api_key(configured_api_key)
    if normalized_configured is not None:
        return normalized_configured

    return _DEFAULT_YOUTUBE_DATA_API_KEY


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
    api_key_value = payload.get("youtube_data_api_key")
    if api_key_value is None:
        # Backward-compat: allow older key names.
        api_key_value = payload.get("youtube_api_key")
    normalized_api_key = _normalize_stored_api_key(api_key_value)
    fallback_api_key = defaults["youtube_data_api_key"]
    score_threshold_value = payload.get("score_threshold")
    backend_driver_value = payload.get("backend_driver")
    return {
        "llm_router": _normalize_router(router_value),
        "backend_driver": _normalize_backend_driver(backend_driver_value),
        "youtube_data_api_key": (
            normalized_api_key
            if normalized_api_key is not None
            else (fallback_api_key if isinstance(fallback_api_key, str) else None)
        ),
        "score_threshold": _normalize_score_threshold(score_threshold_value),
    }


def save_settings(
    *,
    llm_router: LLMRouter | None,
    backend_driver: BackendDriver,
    youtube_data_api_key: str | None,
    score_threshold: float,
) -> dict[str, LLMRouter | BackendDriver | str | float | None]:
    settings = {
        "llm_router": _normalize_router(llm_router),
        "backend_driver": _normalize_backend_driver(backend_driver),
        "youtube_data_api_key": _normalize_stored_api_key(youtube_data_api_key),
        "score_threshold": _normalize_score_threshold(score_threshold),
    }

    _SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = _SETTINGS_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(_SETTINGS_PATH)

    return settings
