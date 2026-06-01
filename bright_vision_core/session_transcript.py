"""Export cecli conversation state for the BrightVision chat UI."""

from __future__ import annotations

from typing import Any


def _message_text(content: Any) -> str | None:
    if isinstance(content, str):
        text = content.strip()
        return text or None
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and isinstance(block.get("text"), str):
                t = block["text"].strip()
                if t:
                    parts.append(t)
        if parts:
            return "\n".join(parts)
    return None


def transcript_rows_from_coder(coder) -> list[dict[str, str]]:
    """User/assistant rows from cecli done + cur messages (post load-session / auto-load)."""
    rows: list[dict[str, str]] = []
    done = getattr(coder, "done_messages", None) or []
    cur = getattr(coder, "cur_messages", None) or []
    for msg in list(done) + list(cur):
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        if role not in ("user", "assistant"):
            continue
        text = _message_text(msg.get("content"))
        if text:
            rows.append({"role": role, "content": text})
    return rows
