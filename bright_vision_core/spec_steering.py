"""Project steering markdown for spec-focus sessions (Kiro-style)."""

from __future__ import annotations

from pathlib import Path

SPEC_FOCUS_INSTRUCTIONS = """\
## Spec-focus mode (BrightVision)

You are in **spec-focus**: work on the active task's requirements, design, and implementation tasks only.

- Prefer editing `.cecli/specs/<task-id>/` layers and related docs; avoid drive-by refactors.
- Use EARS notation: ### REQ-### headings, **WHEN** … **THE** system **SHALL** …
- Keep design and tasks_md aligned with every REQ id; call out gaps explicitly.
- Do not mark implementation done until requirements pass EARS lint (WHEN/SHALL, no duplicate REQ ids).
"""


def load_steering_markdown(workspace: str | Path) -> str:
    """Load ``.cecli/STEERING.md`` and ``.cecli/steering/*.md`` if present."""
    root = Path(workspace).resolve()
    parts: list[str] = []
    single = root / ".cecli" / "STEERING.md"
    if single.is_file():
        try:
            text = single.read_text(encoding="utf-8").strip()
            if text:
                parts.append(text)
        except OSError:
            pass
    steering_dir = root / ".cecli" / "steering"
    if steering_dir.is_dir():
        for path in sorted(steering_dir.glob("*.md")):
            try:
                text = path.read_text(encoding="utf-8").strip()
                if text:
                    parts.append(f"### {path.name}\n{text}")
            except OSError:
                continue
    return "\n\n".join(parts).strip()


def build_spec_focus_preamble(workspace: str | Path) -> str:
    """Steering files + spec-focus instructions for chat prepend."""
    steering = load_steering_markdown(workspace)
    blocks = [SPEC_FOCUS_INSTRUCTIONS.strip()]
    if steering:
        blocks.append("## Project steering\n" + steering)
    return "\n\n".join(blocks) + "\n\n"
