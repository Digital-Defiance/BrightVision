"""Unit tests for LLM SSE helpers (no Ollama)."""

from llm_sse import fuzzy_contains_magic


def test_fuzzy_contains_magic_verbatim():
    assert fuzzy_contains_magic("bv-context-fixture-7f3a", "bv-context-fixture-7f3a")


def test_fuzzy_contains_magic_stuttered_small_model():
    reply = "bvbv-context-context-f-fixtureixture--77ff33aa"
    assert fuzzy_contains_magic(reply, "bv-context-fixture-7f3a")


def test_fuzzy_contains_magic_rejects_unrelated():
    assert not fuzzy_contains_magic("hello from pytest", "bv-context-fixture-7f3a")
