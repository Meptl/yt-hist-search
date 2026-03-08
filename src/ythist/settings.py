from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

LLMBackend = Literal["codex", "claude", "gemini", "opencode"]
LLM_BACKEND_OPTIONS: tuple[LLMBackend, ...] = ("codex", "claude", "gemini", "opencode")

_SETTINGS_DIR = Path.home() / ".local" / "share" / "ythist"
_SETTINGS_PATH = _SETTINGS_DIR / "settings.json"


def settings_path() -> Path:
    return _SETTINGS_PATH


def default_settings() -> dict[str, LLMBackend | None]:
    return {"llm_backend": None}


def _normalize_backend(value: object) -> LLMBackend | None:
    if isinstance(value, str) and value in LLM_BACKEND_OPTIONS:
        return value
    return None


def load_settings() -> dict[str, LLMBackend | None]:
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

    return {"llm_backend": _normalize_backend(payload.get("llm_backend"))}


def save_settings(*, llm_backend: LLMBackend | None) -> dict[str, LLMBackend | None]:
    normalized = _normalize_backend(llm_backend)
    settings = {"llm_backend": normalized}

    _SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = _SETTINGS_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(_SETTINGS_PATH)

    return settings
