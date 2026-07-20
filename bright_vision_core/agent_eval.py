"""
Objective behavioral scoring for agent turns (prompt-quality evals).

This turns an SSE event stream from a ``/agent`` (or implement) turn into a small set of
*objective* behavioral metrics, so two system-prompt versions can be compared on the same
task without subjective judgement. It deliberately reuses the signal parsers in
``agent_turn`` — the same heuristics the live harness uses to detect bad turns — so the
score reflects real product behavior, not a separate definition of "good".

Lower is better for failure counters; the ``followed_edit_contract`` /
``score`` summaries make a turn pass/fail comparable across prompt versions.

Usage (see ``tests/core/test_agent_prompt_eval.py``)::

    from bright_vision_core.agent_eval import score_turn
    metrics = score_turn(events)
    assert metrics.followed_edit_contract
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

from bright_vision_core.agent_turn import (
    agent_had_write_tool_in_events,
    edit_tool_failures_in_events,
    is_agent_tool_activity_event,
    is_edit_tool_success_event,
    is_ls_tool_output_event,
    is_read_range_success_event,
    is_readrange_tool_error_event,
    llm_round_count_from_events,
    max_cumulative_tokens_from_events,
    token_limit_exhausted_in_events,
)


@dataclass
class TurnMetrics:
    """Objective per-turn behavioral signals. Failure counters: lower is better."""

    # Productive work
    wrote_files: bool
    edit_success_count: int
    readrange_success_count: int
    tool_activity_count: int

    # Failure / friction signals (lower is better)
    edit_failure_count: int
    readrange_error_count: int
    ls_call_count: int
    hit_token_limit: bool
    had_error_event: bool

    # Efficiency
    llm_rounds: int
    cumulative_tokens: int

    # Derived verdicts
    readrange_before_first_edit: bool
    followed_edit_contract: bool
    score: float

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _readrange_precedes_first_edit_success(events: list[dict]) -> bool:
    """
    True when a ReadRange success appears before the first successful EditText.

    The edit contract requires ReadRange immediately before EditText. If the turn never
    edited successfully, there is no contract violation to detect (vacuously True); callers
    should check ``wrote_files`` separately when an edit was expected.
    """
    seen_readrange = False
    for event in events:
        if is_read_range_success_event(event):
            seen_readrange = True
        elif is_edit_tool_success_event(event):
            return seen_readrange
    return True


def score_turn(events: list[dict]) -> TurnMetrics:
    """Reduce an SSE event list to objective behavioral metrics."""
    edit_failures = edit_tool_failures_in_events(events)
    edit_successes = sum(1 for e in events if is_edit_tool_success_event(e))
    readrange_successes = sum(1 for e in events if is_read_range_success_event(e))
    readrange_errors = sum(1 for e in events if is_readrange_tool_error_event(e))
    ls_calls = sum(1 for e in events if is_ls_tool_output_event(e))
    tool_activity = sum(1 for e in events if is_agent_tool_activity_event(e))
    had_error = any(e.get("type") == "error" for e in events)
    wrote_files = agent_had_write_tool_in_events(events)
    rr_before_edit = _readrange_precedes_first_edit_success(events)
    hit_token_limit = token_limit_exhausted_in_events(events)

    followed_contract = (
        len(edit_failures) == 0
        and readrange_errors == 0
        and rr_before_edit
        and not had_error
    )

    # Simple bounded score in [0, 1]: start at 1.0, subtract for each friction signal.
    score = 1.0
    score -= 0.20 * min(len(edit_failures), 3)
    score -= 0.20 * min(readrange_errors, 3)
    score -= 0.10 * max(ls_calls - 1, 0)  # one ls is fine; spam is penalized
    score -= 0.30 if had_error else 0.0
    score -= 0.20 if hit_token_limit else 0.0
    score -= 0.30 if not rr_before_edit else 0.0
    score = max(0.0, min(1.0, score))

    return TurnMetrics(
        wrote_files=wrote_files,
        edit_success_count=edit_successes,
        readrange_success_count=readrange_successes,
        tool_activity_count=tool_activity,
        edit_failure_count=len(edit_failures),
        readrange_error_count=readrange_errors,
        ls_call_count=ls_calls,
        hit_token_limit=hit_token_limit,
        had_error_event=had_error,
        llm_rounds=llm_round_count_from_events(events),
        cumulative_tokens=max_cumulative_tokens_from_events(events),
        readrange_before_first_edit=rr_before_edit,
        followed_edit_contract=followed_contract,
        score=round(score, 3),
    )


def summarize_metrics(label: str, metrics: TurnMetrics) -> str:
    """One-line human summary for eval logs / CI output."""
    return (
        f"[{label}] score={metrics.score} contract={'ok' if metrics.followed_edit_contract else 'BROKEN'} "
        f"edits_ok={metrics.edit_success_count} edit_fail={metrics.edit_failure_count} "
        f"rr_ok={metrics.readrange_success_count} rr_err={metrics.readrange_error_count} "
        f"ls={metrics.ls_call_count} rounds={metrics.llm_rounds} "
        f"tokens={metrics.cumulative_tokens} token_limit={metrics.hit_token_limit}"
    )
