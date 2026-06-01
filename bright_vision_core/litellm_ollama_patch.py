"""Tolerate Ollama tool-call argument JSON that local models glue together.

LiteLLM's Ollama adapter uses strict ``json.loads`` on assistant ``tool_calls``
arguments when building the next request. Qwen and similar models often emit
concatenated objects (``{…}{…}``), which Cecli already repairs via
``parse_tool_arguments`` — apply the same repair before LiteLLM chokes.
"""

from __future__ import annotations

import json
from typing import Any

_applied = False


def _parse_tool_arguments_loose(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        from cecli.tools.utils.helpers import parse_tool_arguments

        parsed = parse_tool_arguments(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _ensure_cecli_package() -> None:
    """Load editable ``cecli`` before LiteLLM (its import can shadow it as a namespace)."""
    import cecli as cecli_pkg

    if not getattr(cecli_pkg, "__version__", None):
        raise ImportError(
            "cecli package not installed — run: source activate.sh "
            "(pip install -e cecli)"
        )


def apply_litellm_ollama_tool_argument_patch() -> None:
    global _applied
    if _applied:
        return
    _ensure_cecli_package()
    try:
        from litellm.llms.ollama.chat.transformation import OllamaChatConfig
    except ImportError:
        return

    _orig = OllamaChatConfig.transform_request

    def _transform_request(self, model: str, messages: list, optional_params: dict, litellm_params: dict, headers: dict) -> dict:
        for m in messages:
            if not isinstance(m, dict):
                continue
            tool_calls = m.get("tool_calls")
            if not isinstance(tool_calls, list):
                continue
            for tool in tool_calls:
                fn = tool.get("function") if isinstance(tool, dict) else None
                if not isinstance(fn, dict):
                    continue
                args = fn.get("arguments")
                if isinstance(args, str) and args.strip():
                    fn["arguments"] = json.dumps(_parse_tool_arguments_loose(args))
        return _orig(self, model, messages, optional_params, litellm_params, headers)

    OllamaChatConfig.transform_request = _transform_request  # type: ignore[method-assign]
    _applied = True
