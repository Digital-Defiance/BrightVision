"""Unit tests for LLM SSE helpers (no Ollama)."""

from llm_sse import fuzzy_contains_magic, parse_sse_chunk, parse_sse_payload


def test_parse_sse_payload_skips_null_and_non_object():
    raw = (
        'data: {"type":"token","text":"hi"}\n\n'
        "data: null\n\n"
        'data: ["not","an","object"]\n\n'
        'data: {"type":"done"}\n\n'
    )
    events = parse_sse_payload(raw)
    assert [e.get("type") for e in events] == ["token", "done"]


def test_parse_sse_chunk_skips_null():
    batch, rest = parse_sse_chunk('data: null\n\ndata: {"type":"done"}\n\n')
    assert [e.get("type") for e in batch] == ["done"]
    assert rest == ""


def test_fuzzy_contains_magic_verbatim():
    assert fuzzy_contains_magic("bv-context-fixture-7f3a", "bv-context-fixture-7f3a")


def test_fuzzy_contains_magic_stuttered_small_model():
    reply = "bvbv-context-context-f-fixtureixture--77ff33aa"
    assert fuzzy_contains_magic(reply, "bv-context-fixture-7f3a")


def test_fuzzy_contains_magic_rejects_unrelated():
    assert not fuzzy_contains_magic("hello from pytest", "bv-context-fixture-7f3a")
