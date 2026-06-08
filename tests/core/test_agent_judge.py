"""Deterministic tests for the LLM-judge rubric scorer (no live model required).

These cover transcript rendering and response parsing — the parts that must be robust to
messy model output. The actual grading runs only under E2E_LLM in test_agent_prompt_eval.py.
"""

from __future__ import annotations

import asyncio

from bright_vision_core.agent_judge import (
    RUBRIC_DIMENSIONS,
    build_judge_messages,
    judge_transcript,
    parse_judge_response,
    summarize_verdict,
    transcript_from_events,
)


def _good_json() -> str:
    keys = ", ".join(f'"{k}": 4' for k in RUBRIC_DIMENSIONS)
    return '{"scores": {' + keys + '}, "notes": "Stayed in scope; clear summary."}'


def test_parse_clean_json():
    v = parse_judge_response(_good_json())
    assert v.ok is True
    assert v.parse_error is None
    assert set(v.scores) == set(RUBRIC_DIMENSIONS)
    assert v.overall == 4.0
    assert "scope" in v.notes.lower()
    assert "overall=4.0" in summarize_verdict("x", v)


def test_parse_strips_code_fences():
    v = parse_judge_response("```json\n" + _good_json() + "\n```")
    assert v.ok is True
    assert v.overall == 4.0


def test_parse_extracts_json_from_surrounding_prose():
    v = parse_judge_response("Here is my evaluation:\n" + _good_json() + "\nThanks!")
    assert v.ok is True


def test_parse_clamps_out_of_range_and_overall():
    keys = ", ".join(f'"{k}"' for k in RUBRIC_DIMENSIONS)
    # First dim 9 -> clamped to 5, rest 1.
    vals = [9] + [1] * (len(RUBRIC_DIMENSIONS) - 1)
    pairs = ", ".join(f'"{k}": {val}' for k, val in zip(RUBRIC_DIMENSIONS, vals))
    v = parse_judge_response('{"scores": {' + pairs + "}}")
    assert v.ok is True
    first = next(iter(RUBRIC_DIMENSIONS))
    assert v.scores[first] == 5  # clamped
    assert all(1 <= s <= 5 for s in v.scores.values())


def test_parse_missing_dimension_flags_not_ok():
    # Only one dimension provided.
    one = next(iter(RUBRIC_DIMENSIONS))
    v = parse_judge_response('{"scores": {"' + one + '": 3}}')
    assert v.ok is False
    assert "missing dimensions" in (v.parse_error or "")


def test_parse_garbage_is_safe():
    v = parse_judge_response("the model refused to answer")
    assert v.ok is False
    assert v.overall == 0.0
    assert v.scores == {}
    assert "UNAVAILABLE" in summarize_verdict("x", v)


def test_transcript_keeps_signal_drops_noise():
    events = [
        {"type": "user_message", "text": "/agent fix greet()"},
        {"type": "tool_output", "text": "Tool Call: Local • EditText"},
        {"type": "tool_output", "text": "12k ↑ 40 ↓ 12k ↑↓"},  # token footer noise
        {"type": "tool_output", "text": "Running git status"},  # noise prefix
        {"type": "tool_error", "text": "Error in ReadRange"},
        {"type": "done", "assistant_text": "Updated greet()."},
    ]
    t = transcript_from_events(events)
    assert "USER: /agent fix greet()" in t
    assert "EditText" in t
    assert "TOOL_ERROR: Error in ReadRange" in t
    assert "ASSISTANT_SUMMARY: Updated greet()." in t
    assert "↑↓" not in t
    assert "Running git status" not in t


def test_transcript_truncates_middle():
    big = "x" * 50_000
    events = [
        {"type": "user_message", "text": "TASK_MARKER"},
        {"type": "tool_output", "text": big},
        {"type": "done", "assistant_text": "END_MARKER"},
    ]
    t = transcript_from_events(events, max_chars=2000)
    assert len(t) <= 2200
    assert "TASK_MARKER" in t  # head survives
    assert "END_MARKER" in t  # tail survives
    assert "truncated" in t


def test_build_judge_messages_has_rubric_and_task():
    msgs = build_judge_messages("do X", "USER: do X\nASSISTANT_SUMMARY: did X")
    assert msgs[0]["role"] == "system"
    user = msgs[1]["content"]
    assert "do X" in user
    for dim in RUBRIC_DIMENSIONS:
        assert dim in user


def test_judge_transcript_handles_model_error():
    class _BoomModel:
        async def simple_send_with_retries(self, messages):
            raise RuntimeError("ollama down")

    v = asyncio.run(judge_transcript(_BoomModel(), "task", "transcript"))
    assert v.ok is False
    assert "model:" in (v.parse_error or "")


def test_judge_transcript_parses_model_reply():
    payload = _good_json()

    class _StubModel:
        async def simple_send_with_retries(self, messages):
            return payload

    v = asyncio.run(judge_transcript(_StubModel(), "task", "transcript"))
    assert v.ok is True
    assert v.overall == 4.0
