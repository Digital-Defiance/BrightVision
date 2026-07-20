"""LiteLLM provider model ids for E2E (not ollama_chat/…)."""

from __future__ import annotations

LITELLM_PROVIDER_PREFIXES = (
    "openai/",
    "anthropic/",
    "azure/",
    "gemini/",
    "cohere/",
    "groq/",
    "deepseek/",
    "openrouter/",
    "mistral/",
    "xai/",
)


def is_provider_vision_model(model: str) -> bool:
    m = model.strip().lower()
    return any(m.startswith(p) for p in LITELLM_PROVIDER_PREFIXES)


def normalize_vision_model_for_e2e(model: str, *, backend: str | None = None) -> str:
    """Map bare local tags to LiteLLM provider ids (``openai/`` or ``ollama_chat/``)."""
    m = model.strip()
    if not m:
        return m
    if (
        is_provider_vision_model(m)
        or m.startswith("ollama_chat/")
        or m.startswith("ollama/")
    ):
        return m
    if (backend or "").strip().lower() == "lmstudio":
        return f"openai/{m}"
    return f"ollama_chat/{m}"
