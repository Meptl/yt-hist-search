from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from typing import Literal

LLMRouter = Literal["codex", "claude", "gemini", "opencode"]

_STATIC_FILTERS_SUPPORTED: tuple[str, ...] = (
    "time (set key `time`; supported formats: `YYYY`, `YYYY-MM`, `YYYY-MM-DD`, "
    "`>=YYYY-MM-DD`, `<=YYYY-MM-DD`, or `YYYY-MM-DD..YYYY-MM-DD`)",
)

_DEFAULT_COMMAND_CANDIDATES: dict[LLMRouter, list[list[str]]] = {
    "codex": [["codex", "exec"], ["codex"]],
    "claude": [["claude", "-p"], ["claude"]],
    "gemini": [["gemini", "-p"], ["gemini"]],
    "opencode": [["opencode", "run", "-p"], ["opencode"]],
}


class LLMRouterError(RuntimeError):
    pass


@dataclass(frozen=True)
class LLMRouterResult:
    new_prompt: str
    static_filters: dict[str, str]
    raw_response: str


def _build_router_prompt(user_query: str) -> str:
    filters = "\n".join(f"- {value}" for value in _STATIC_FILTERS_SUPPORTED) or "- (none)"
    return (
        "You are rewriting a user request for semantic RAG retrieval.\n"
        "Please extract static filters that we support.\n\n"
        "We support the following static filters:\n"
        f"{filters}\n\n"
        "Return valid JSON only in this shape:\n"
        '{\n'
        '  "new_prompt": "PROMPT",\n'
        '  "static_filters": {\n'
        '    "FILTER_NAME": "FILTER_VALUE"\n'
        "  }\n"
        "}\n\n"
        "Requirements:\n"
        "- Remove discovered static filters from new_prompt.\n"
        "- Put discovered supported static filters in static_filters.\n"
        "- For time filtering, always use key `time` and one of the supported formats.\n"
        "- Keep the request intent intact.\n"
        "- If there are no supported static filters, return the original prompt (light cleanup is fine).\n"
        "- Do not include markdown fences.\n\n"
        f"User request:\n{user_query}"
    )


def _extract_json_object(raw_text: str) -> dict[str, object]:
    stripped = raw_text.strip()
    if not stripped:
        raise LLMRouterError("LLM Router returned an empty response.")

    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        raise LLMRouterError(
            "LLM Router returned non-JSON output. Configure a non-interactive command "
            "that outputs JSON for the selected router."
        ) from None

    if not isinstance(parsed, dict):
        raise LLMRouterError("LLM Router output must be a JSON object.")
    return parsed


def rewrite_prompt_with_router(
    *,
    llm_router: LLMRouter,
    user_query: str,
    timeout_seconds: int = 45,
) -> LLMRouterResult:
    command_candidates = _DEFAULT_COMMAND_CANDIDATES[llm_router]
    prompt = _build_router_prompt(user_query)
    failures: list[str] = []
    missing_command = False

    for base_command in command_candidates:
        binary = base_command[0]
        if shutil.which(binary) is None:
            missing_command = True
            continue

        for command in (base_command + [prompt], base_command):
            try:
                result = subprocess.run(
                    command,
                    input=prompt,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                )
            except FileNotFoundError:
                missing_command = True
                break
            except subprocess.TimeoutExpired:
                failures.append(
                    f"`{' '.join(command)}` timed out after {timeout_seconds}s."
                )
                continue
            except OSError as exc:
                failures.append(f"`{' '.join(command)}` failed to execute: {exc}")
                continue

            if result.returncode != 0:
                stderr = (result.stderr or "").strip()
                details = stderr or f"exit code {result.returncode}"
                failures.append(f"`{' '.join(command)}` failed: {details}")
                continue

            raw_output = (result.stdout or "").strip()
            if not raw_output and result.stderr:
                raw_output = result.stderr.strip()
            payload = _extract_json_object(raw_output)
            new_prompt = payload.get("new_prompt")
            if not isinstance(new_prompt, str) or not new_prompt.strip():
                raise LLMRouterError(
                    "LLM Router response is missing a non-empty `new_prompt` string."
                )
            raw_filters = payload.get("static_filters", {})
            if raw_filters is None:
                raw_filters = {}
            if not isinstance(raw_filters, dict):
                raise LLMRouterError("LLM Router `static_filters` must be a JSON object.")
            static_filters = {
                str(key): str(value)
                for key, value in raw_filters.items()
                if value is not None
            }
            return LLMRouterResult(
                new_prompt=new_prompt.strip(),
                static_filters=static_filters,
                raw_response=raw_output,
            )

    if missing_command:
        raise LLMRouterError(f"`{llm_router}` command not found in PATH.")

    failure_message = "; ".join(failures[:3]) if failures else "unknown router execution failure"
    raise LLMRouterError(f"LLM Router execution failed: {failure_message}")
