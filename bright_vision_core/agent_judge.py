"""
LLM-as-judge rubric scoring for agent turns (subjective prompt-quality signal).

The deterministic scorer in ``agent_eval`` measures *behavior* (did the agent follow the
edit contract, loop, error out). This module covers the *subjective* half — tone, scope
discipline, directness, and whether the final summary is useful — by asking a model to
grade the turn transcript against a fixed rubric and return structured JSON.

It is intentionally separate and opt-in: nothing here runs in the default gate, and the
judge model is supplied by the caller (no judge dependency is pinned). Use a capable model
as the judge — grading is easier than coding, but a 3b model makes a noisy judge.

Usage (see ``tests/core/test_agent_prompt_eval.py``)::

    from cecli import models
    from bright_vision_core.agent_judge import judge_transcript, transcript_from_events
    judge_model = models.Model("ollama_chat/qwen3-coder:30b")
    verdict = await judge_transcript(judge_model, task, transcript_from_events(events))
    assert verdict.overall >= 3
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict, field
from typing import Any

# Rubric dimensions scored 1 (poor) .. 5 (excellent). Keep names stable: tests and
# eval logs key on them.
RUBRIC_DIMENSIONS: dict[str, str] = {
    "scope_discipline": (
        "Did the agent do only what the task asked, without unrequested refactors, "
        "reformatting, or edits to unrelated code? 5 = perfectly scoped; 1 = sprawling."
    ),
    "directness": (
        "Was the agent's communication concise and confident, leading with substance, "
        "without filler, hedging, or repeated restatements? 5 = crisp; 1 = rambling."
    ),
    "investigation": (
        "Did the agent read/inspect relevant code before acting or claiming, rather than "
        "guessing? 5 = grounded in what it actually read; 1 = unfounded assertions."
    ),
    "summary_quality": (
        "Was the final summary accurate, useful, and free of tool-call syntax or internal "
        "jargon — something the user can act on? 5 = clear and honest; 1 = absent/misleading."
    ),
}

_SCALE_MIN = 1
_SCALE_MAX = 5

_SYSTEM_PROMPT = (
    "You are a strict, fair evaluator of an AI software-engineering agent's turn. "
    "You are grading the agent's behavior and communication quality against a rubric — "
    "NOT redoing the task. Be objective and cite the transcript. "
    "Respond with ONLY a single JSON object, no prose, no code fences."
)


@dataclass
class JudgeVerdict:
    """Rubric scores (1..5 per dimension) plus an overall and the judge's notes."""

    scores: dict[str, int]
    overall: float
    notes: str = ""
    raw: str = ""
    parse_error: str | None = None
    dimensions: dict[str, str] = field(default_factory=lambda: dict(RUBRIC_DIMENSIONS))

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    @property
    def ok(self) -> bool:
        """True when the judge returned usable scores for every rubric dimension."""
        return self.parse_error is None and set(self.scores) == set(RUBRIC_DIMENSIONS)


def transcript_from_events(events: list[dict], *, max_chars: int = 12_000) -> str:
    """
    Render an SSE event stream into a compact transcript for the judge.

    Keeps the user message, assistant prose, tool calls, tool output/errors, and the final
    summary — the things a reviewer would read. Token-usage footers and progress pulses are
    dropped. Truncated from the middle if oversized so both the task and the ending survive.
    """
    lines: list[str] = []
    for event in events:
        kind = event.get("type")
        text = str(event.get("text") or "").strip()
        if kind == "user_message":
            lines.append(f"USER: {text}")
        elif kind == "tool_output":
            if text and not _is_noise(text):
                lines.append(f"TOOL: {text}")
        elif kind == "tool_error":
            if text:
                lines.append(f"TOOL_ERROR: {text}")
        elif kind == "error":
            if text:
                lines.append(f"ERROR: {text}")
        elif kind == "done":
            summary = str(event.get("assistant_text") or "").strip()
            if summary:
                lines.append(f"ASSISTANT_SUMMARY: {summary}")
    transcript = "\n".join(lines).strip()
    if len(transcript) <= max_chars:
        return transcript
    head = transcript[: max_chars // 2]
    tail = transcript[-max_chars // 2 :]
    return f"{head}\n…[transcript truncated]…\n{tail}"


_NOISE_PREFIXES = ("Recovered prose shell", "Running ")
_TOKEN_FOOTER = re.compile(r"^[\d.]+k?\s+[↑↓]")


def _is_noise(text: str) -> bool:
    if _TOKEN_FOOTER.match(text):
        return True
    return any(text.startswith(p) for p in _NOISE_PREFIXES)


def build_judge_messages(task: str, transcript: str) -> list[dict[str, str]]:
    """Build the chat messages for the judge model."""
    rubric_lines = "\n".join(f"- {name}: {desc}" for name, desc in RUBRIC_DIMENSIONS.items())
    keys = ", ".join(f'"{k}"' for k in RUBRIC_DIMENSIONS)
    user = (
        f"# Task given to the agent\n{task}\n\n"
        f"# Agent turn transcript\n{transcript}\n\n"
        f"# Rubric (score each {_SCALE_MIN}-{_SCALE_MAX}, integers only)\n{rubric_lines}\n\n"
        "# Output\n"
        "Return ONLY this JSON object (no markdown, no fences):\n"
        '{"scores": {' + keys + ': <int>}, "notes": "<one or two sentences citing the transcript>"}'
    )
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def _clamp(value: Any) -> int | None:
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    return max(_SCALE_MIN, min(_SCALE_MAX, n))


def parse_judge_response(raw: str) -> JudgeVerdict:
    """Parse the judge's JSON reply into a verdict, tolerating fences and stray prose."""
    text = (raw or "").strip()
    # Strip accidental code fences.
    fence = re.match(r"^```[a-zA-Z]*\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    # Grab the first {...} block if there is surrounding prose.
    if not text.startswith("{"):
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if brace:
            text = brace.group(0)
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError) as err:
        return JudgeVerdict(scores={}, overall=0.0, raw=raw, parse_error=f"json: {err}")

    raw_scores = data.get("scores") if isinstance(data, dict) else None
    if not isinstance(raw_scores, dict):
        return JudgeVerdict(scores={}, overall=0.0, raw=raw, parse_error="missing 'scores' object")

    scores: dict[str, int] = {}
    for dim in RUBRIC_DIMENSIONS:
        val = _clamp(raw_scores.get(dim))
        if val is not None:
            scores[dim] = val
    missing = set(RUBRIC_DIMENSIONS) - set(scores)
    parse_error = f"missing dimensions: {sorted(missing)}" if missing else None
    overall = round(sum(scores.values()) / len(scores), 2) if scores else 0.0
    notes = str(data.get("notes") or "").strip() if isinstance(data, dict) else ""
    return JudgeVerdict(
        scores=scores, overall=overall, notes=notes, raw=raw, parse_error=parse_error
    )


async def judge_transcript(judge_model, task: str, transcript: str) -> JudgeVerdict:
    """
    Score a turn transcript with ``judge_model`` against the rubric.

    ``judge_model`` is any cecli ``models.Model`` exposing the async
    ``simple_send_with_retries(messages)`` API. Returns a :class:`JudgeVerdict`; on a model
    or parse failure the verdict carries ``parse_error`` and ``ok == False`` rather than
    raising, so eval callers can degrade gracefully.
    """
    messages = build_judge_messages(task, transcript)
    try:
        reply = await judge_model.simple_send_with_retries(messages)
    except Exception as err:  # network/model errors should not crash an eval run
        return JudgeVerdict(scores={}, overall=0.0, parse_error=f"model: {err}")
    if not reply:
        return JudgeVerdict(scores={}, overall=0.0, parse_error="empty judge response")
    return parse_judge_response(reply)


def summarize_verdict(label: str, verdict: JudgeVerdict) -> str:
    """One-line human summary for eval logs / CI output."""
    if not verdict.ok:
        return f"[{label}] judge: UNAVAILABLE ({verdict.parse_error})"
    dims = " ".join(f"{k}={v}" for k, v in verdict.scores.items())
    return f"[{label}] judge overall={verdict.overall} {dims}"
