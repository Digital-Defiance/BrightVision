"""Unit tests for E2E Ollama tag matching (no live Ollama required)."""

from llm_ollama import is_tag_pulled, resolve_ollama_tag, vision_model_from_tag


def test_is_tag_pulled_exact_and_version_suffix():
    names = ["llama3.2:3b", "qwen2.5:7b"]
    assert is_tag_pulled(names, "llama3.2:3b")
    assert is_tag_pulled(["llama3.2:3b:latest"], "llama3.2:3b")
    assert not is_tag_pulled(names, "llama3.2:1b")


def test_resolve_ollama_tag_from_e2e_env(monkeypatch):
    monkeypatch.setenv("E2E_OLLAMA_MODEL", "ollama_chat/llama3.2:3b")
    assert resolve_ollama_tag() == "llama3.2:3b"
    assert vision_model_from_tag(resolve_ollama_tag()) == "ollama_chat/llama3.2:3b"


def test_vision_model_passes_through_openai_provider():
    assert vision_model_from_tag("openai/gpt-4o-mini") == "openai/gpt-4o-mini"
    assert vision_model_from_tag("azure/my-deployment") == "azure/my-deployment"
