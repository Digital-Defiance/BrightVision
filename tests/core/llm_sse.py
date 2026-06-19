"""SSE helpers for E2E_LLM=1 pytest (pairs with Playwright llm specs)."""

from __future__ import annotations

import json


def _load_sse_data_line(line: str) -> dict | None:
    """Parse one ``data: …`` line; ignore comments, malformed JSON, and non-object payloads."""
    if not line.startswith("data: "):
        return None
    try:
        parsed = json.loads(line[6:])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def parse_sse_payload(raw: str) -> list[dict]:
    events: list[dict] = []
    for part in raw.split("\n\n"):
        for line in part.split("\n"):
            ev = _load_sse_data_line(line)
            if ev is not None:
                events.append(ev)
    return events


def parse_sse_chunk(buf: str) -> tuple[list[dict], str]:
    """Return (events, remainder) from accumulated SSE text."""
    events: list[dict] = []
    while "\n\n" in buf:
        part, buf = buf.split("\n\n", 1)
        for line in part.split("\n"):
            ev = _load_sse_data_line(line)
            if ev is not None:
                events.append(ev)
    return events, buf


def assistant_text(events: list[dict]) -> str:
    """Prefer ``done.assistant_text`` — token streams can duplicate chunks on some Ollama models."""
    done = next((e for e in events if e.get("type") == "done"), None)
    if done:
        from_done = str(done.get("assistant_text") or "").strip()
        if from_done:
            return from_done
    tokens = [e.get("text", "") for e in events if e.get("type") == "token"]
    return "".join(tokens)


def user_message_text(events: list[dict]) -> str:
    ev = next((e for e in events if e.get("type") == "user_message"), None)
    return str(ev.get("text") or "") if ev else ""


def _is_hex_part(part: str) -> bool:
    return len(part) >= 2 and all(c in "0123456789abcdef" for c in part.lower())


def fuzzy_contains_magic(reply: str, magic: str) -> bool:
    """
    True when *magic* appears verbatim or each hyphen segment appears in *reply*.

    Small local models sometimes double syllables (``bvbv-context-context-…``) or mash
    hex tails (``77ff33aa`` for ``7f3a``); Playwright e2e uses the same leniency.
    """
    text = (reply or "").strip().lower()
    if not text or not magic:
        return False
    magic_lower = magic.lower()
    if magic_lower in text:
        return True
    parts = [p for p in magic_lower.split("-") if p]
    if not parts:
        return False
    if all(p in text for p in parts):
        return True
    for part in parts:
        if part in text:
            continue
        if _is_hex_part(part):
            if not all(c in text for c in part):
                return False
            continue
        prefix_len = max(2, (len(part) + 1) // 2)
        if part[:prefix_len] not in text:
            return False
    return True


def tool_output_text(events: list[dict]) -> str:
    chunks: list[str] = []
    for e in events:
        if e.get("type") == "tool_output":
            chunks.append(str(e.get("text") or ""))
    return "\n".join(chunks)
