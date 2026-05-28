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


def maybe_append_roadmap_hint(user_text: str, coder: Any) -> str:
    """Append a one-block hint for common /agent 'what's next' questions."""
    text = (user_text or "").strip()
    if not text:
        return user_text
    lower = text.lower()
    if "roadmap" not in lower and "what's next" not in lower and "whats next" not in lower:
        if "next" not in lower or "what" not in lower:
            return user_text
    if not _roadmap_in_chat(coder):
        return user_text
    if _ROADMAP_HINT in text:
        return user_text
    return f"{text}\n\n{_ROADMAP_HINT}"
