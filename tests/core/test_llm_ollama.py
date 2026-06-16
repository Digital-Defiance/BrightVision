"""Unit tests for E2E Ollama tag matching (no live Ollama required)."""

from llm_ollama import is_tag_pulled, resolve_ollama_tag, vision_model_from_tag


def test_is_tag_pulled_exact_and_version_suffix():
    names = ["llama3.2:3b", "qwen2.5:7b"]
    assert is_tag_pulled(names, "llama3.2:3b")
    assert is_tag_pulled(["llama3.2:3b:latest"], "llama3.2:3b")
    assert not is_tag_pulled(names, "llama3.2:1b")


def test_resolve_ollama_tag_from_e2e_env(monkeypatch):
    monkeypatch.setenv("E2E_OLLAMA_MODEL", "openai/llama-3.2-3b-instruct")
    monkeypatch.setenv("BRIGHTVISION_LLM_BACKEND", "lmstudio")
    assert resolve_ollama_tag() == "llama-3.2-3b-instruct"
    assert vision_model_from_tag(resolve_ollama_tag()) == "openai/llama-3.2-3b-instruct"


def test_resolve_ollama_tag_from_e2e_env_ollama_backend(monkeypatch):
    monkeypatch.setenv("E2E_OLLAMA_MODEL", "ollama_chat/llama3.2:3b")
    monkeypatch.setenv("BRIGHTVISION_LLM_BACKEND", "ollama")
    assert resolve_ollama_tag() == "llama3.2:3b"
    assert vision_model_from_tag(resolve_ollama_tag()) == "ollama_chat/llama3.2:3b"


def test_resolve_ollama_tag_ignores_data_model_in_suite_lmstudio(monkeypatch):
    monkeypatch.delenv("E2E_OLLAMA_MODEL", raising=False)
    monkeypatch.setenv("BV_TEST_SUITE_ACTIVE", "1")
    monkeypatch.setenv("DATA_MODEL", "qwen/qwen3.6-27b")
    monkeypatch.setenv("BRIGHTVISION_LLM_BACKEND", "lmstudio")
    assert resolve_ollama_tag() == "llama-3.2-3b-instruct"
    assert (
        vision_model_from_tag(resolve_ollama_tag())
        == "openai/llama-3.2-3b-instruct"
    )


def test_resolve_ollama_tag_ignores_data_model_in_suite_ollama(monkeypatch):
    monkeypatch.delenv("E2E_OLLAMA_MODEL", raising=False)
    monkeypatch.setenv("BV_TEST_SUITE_ACTIVE", "1")
    monkeypatch.setenv("DATA_MODEL", "qwen3.6:27b-q4_K_M")
    monkeypatch.setenv("BRIGHTVISION_LLM_BACKEND", "ollama")
    assert resolve_ollama_tag() == "llama3.2:3b"


def test_vision_model_passes_through_openai_provider():
    assert vision_model_from_tag("openai/gpt-4o-mini") == "openai/gpt-4o-mini"
    assert vision_model_from_tag("azure/my-deployment") == "azure/my-deployment"
