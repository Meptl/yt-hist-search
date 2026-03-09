from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

LLMRouter = Literal["codex", "claude", "gemini", "opencode"]
LLM_ROUTER_OPTIONS: tuple[LLMRouter, ...] = ("codex", "claude", "gemini", "opencode")

_SETTINGS_DIR = Path.home() / ".local" / "share" / "ythist"
_SETTINGS_PATH = _SETTINGS_DIR / "settings.json"


def default_settings() -> dict[str, LLMRouter | str | None]:
    return {
        "llm_router": None,
        "youtube_data_api_key": None,
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


def load_settings() -> dict[str, LLMRouter | str | None]:
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
    return {
        "llm_router": _normalize_router(router_value),
        "youtube_data_api_key": _normalize_api_key(api_key_value),
    }


def save_settings(
    *, llm_router: LLMRouter | None, youtube_data_api_key: str | None
) -> dict[str, LLMRouter | str | None]:
    settings = {
        "llm_router": _normalize_router(llm_router),
        "youtube_data_api_key": _normalize_api_key(youtube_data_api_key),
    }

    _SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = _SETTINGS_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(_SETTINGS_PATH)

    return settings
