"""Implement-turn progress: auto-mark and persistence hooks."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from cecli.spec.todos import TodoItem


def persist_auto_mark_implement_step(
    workspace: str | Path,
    item: TodoItem,
    *,
    focus_step: str | None,
    flutter_test_ok: bool | None,
    verify_ok: bool | None,
) -> tuple[TodoItem | None, bool]:
    """Mark focus step done when verify/flutter gates pass; persist to todos.json."""
    from bright_vision_core.spec_progress import try_mark_focus_step_complete
    from bright_vision_core.workspace_todos import WorkspaceTodos

    updated, changed = try_mark_focus_step_complete(
        item,
        focus_step,
        flutter_test_ok=flutter_test_ok,
        verify_ok=verify_ok,
    )
    if not changed:
        return None, False
    api = WorkspaceTodos(workspace)
    persisted, _ = api.update(
        item.id,
        checklist=updated.checklist,
        tasks_md=updated.tasks_md,
        auto_complete_checklist=True,
    )
    return persisted, True


def implementation_progress_payload(item: TodoItem) -> dict[str, Any]:
    from bright_vision_core.spec_progress import (
        implementation_steps,
        next_open_implementation_step,
    )

    steps = implementation_steps(item)
    nxt = next_open_implementation_step(item, None)
    return {
        "todo_id": item.id,
        "title": item.title,
        "steps": [
            {
                "step_id": s.step_id,
                "text": s.text,
                "done": s.done,
                "current": s.current,
                "verify_cmd": s.verify_cmd,
            }
            for s in steps
        ],
        "next_open": (
            {
                "step_id": nxt.step_id,
                "text": nxt.text,
                "verify_cmd": nxt.verify_cmd,
            }
            if nxt
            else None
        ),
    }
