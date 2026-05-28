"""Inject short hints when the user asks about docs/ROADMAP.md priority."""

from __future__ import annotations

from typing import Any

_ROADMAP_HINT = (
    "<hint from BrightVision>\n"
    "docs/ROADMAP.md is already in context. For what is next: read "
    '"Suggested fix order" and rows marked **Open** or **Partial** '
    "(use ReadRange @000→000@ once, or Grep for `| **Open**`). "
    "Do not claim the file was reverted unless you used an edit tool. "
    "Prefer one ReadRange over repeated identical calls.\n"
    "</hint>"
)


def _roadmap_in_chat(coder: Any) -> bool:
    try:
        rel = {str(p).replace("\\", "/") for p in coder.get_inchat_relative_files()}
    except Exception:
        return False
    return any(p.endswith("docs/ROADMAP.md") or p == "ROADMAP.md" for p in rel)


def _asks_for_roadmap_priority(lower: str) -> bool:
    if "roadmap" in lower:
        return True
    if "what's next" in lower or "whats next" in lower:
        return True
    if "next thing" in lower or "the next thing" in lower:
        return True
    if "work on the next" in lower or "next priority" in lower or "next item" in lower:
        return True
    if "next" in lower and "what" in lower:
        return True
    if "next" in lower and ("shall we" in lower or "let's" in lower or "lets " in lower):
        return True
    return False


def maybe_append_roadmap_hint(user_text: str, coder: Any) -> str:
    """Append a one-block hint for common /agent 'what's next' questions."""
    text = (user_text or "").strip()
    if not text:
        return user_text
    lower = text.lower()
    if not _asks_for_roadmap_priority(lower):
        return user_text
    if not _roadmap_in_chat(coder):
        return user_text
    if _ROADMAP_HINT in text:
        return user_text
    return f"{text}\n\n{_ROADMAP_HINT}"
