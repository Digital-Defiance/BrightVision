"""Deterministic tests for the agent behavioral scorer (no LLM required).

These prove the scorer in ``bright_vision_core.agent_eval`` turns SSE event streams into
the right objective signals, using synthetic events that mirror real cecli tool output.
The opt-in real-Ollama comparison lives in ``test_agent_prompt_eval.py``.
"""

from __future__ import annotations

from bright_vision_core.agent_eval import score_turn, summarize_metrics


def _tool_output(text: str) -> dict:
    return {"type": "tool_output", "text": text}


def _tool_error(text: str) -> dict:
    return {"type": "tool_error", "text": text}


def _clean_edit_turn() -> list[dict]:
    """ReadRange before EditText, one successful edit, no errors — the happy path."""
    return [
        {"type": "user_message", "text": "/agent add a docstring"},
        _tool_output("Tool Call: Local • ReadRange"),
        _tool_output("✅ Retrieved context for 1 operation(s)"),
        _tool_output("Tool Call: Local • EditText"),
        _tool_output("Applied 1 edits in foo.py"),
        _tool_output("12k ↑ 40 ↓ 12k ↑↓"),
        {"type": "done", "assistant_text": "Added the docstring."},
    ]


def test_clean_turn_follows_contract():
    m = score_turn(_clean_edit_turn())
    assert m.followed_edit_contract is True
    assert m.wrote_files is True
    assert m.edit_success_count == 1
    assert m.readrange_success_count == 1
    assert m.readrange_before_first_edit is True
    assert m.edit_failure_count == 0
    assert m.score == 1.0
    # summary is just a label string
    assert "contract=ok" in summarize_metrics("clean", m)


def test_edit_without_readrange_breaks_contract():
    events = [
        _tool_output("Tool Call: Local • EditText"),
        _tool_error("Error in EditText: Please call `ReadRange` first"),
    ]
    m = score_turn(events)
    assert m.followed_edit_contract is False
    assert m.edit_failure_count >= 1
    assert m.score < 1.0


def test_readrange_after_edit_does_not_count_as_before():
    events = [
        _tool_output("Tool Call: Local • EditText"),
        _tool_output("Applied 1 edits in foo.py"),
        _tool_output("✅ Retrieved context for 1 operation(s)"),
    ]
    m = score_turn(events)
    # ReadRange success came *after* the first successful edit.
    assert m.readrange_before_first_edit is False
    assert m.followed_edit_contract is False


def test_ls_spam_penalized_but_one_ls_is_free():
    one_ls = score_turn([_tool_output("Tool Call: Local • ls")] + _clean_edit_turn())
    assert one_ls.ls_call_count == 1
    assert one_ls.score == 1.0  # a single ls is not penalized

    many = [_tool_output("Tool Call: Local • ls") for _ in range(4)]
    spam = score_turn(many + _clean_edit_turn())
    assert spam.ls_call_count == 4
    assert spam.score < 1.0


def test_error_event_and_token_limit_lower_score():
    err = score_turn([{"type": "error", "text": "boom"}])
    assert err.had_error_event is True
    assert err.followed_edit_contract is False

    tl = score_turn([_tool_error("The model has hit a token limit")])
    assert tl.hit_token_limit is True
    assert tl.score < 1.0


def test_readrange_error_counts():
    m = score_turn([_tool_error("Error in ReadRange: invalid markers")])
    assert m.readrange_error_count == 1
    assert m.followed_edit_contract is False
