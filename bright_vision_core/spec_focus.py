"""When spec-focus mode actually applies (active task + spec content)."""

from __future__ import annotations

from pathlib import Path

from bright_vision_core.spec_steering import SPEC_FOCUS_INSTRUCTIONS, build_spec_focus_preamble
from bright_vision_core.workspace_todos import TodoItem, TodoStore, format_todo_context, migrate_todo_layers

_SPEC_LAYER_PLACEHOLDERS = frozenset(
    {
        "(No requirements yet.)",
        "(No design yet.)",
        "(No implementation tasks yet.)",
    }
)


def todo_has_spec_content(item: TodoItem) -> bool:
    """True when the task has non-placeholder requirements, design, tasks, or legacy spec."""
    item = migrate_todo_layers(item)
    for field in (item.requirements, item.design, item.tasks_md, item.spec):
        text = field.strip()
        if text and text not in _SPEC_LAYER_PLACEHOLDERS:
            return True
    return False


def spec_focus_requested(
    *,
    message_spec_focus: bool,
    session_spec_focus: bool,
    session_mode: str,
) -> bool:
    return bool(message_spec_focus or session_spec_focus or session_mode == "spec")


def should_inject_task_context(
    *,
    focus_requested: bool,
    item: TodoItem | None,
    inject_todo_spec: bool,
) -> bool:
    if item is None:
        return False
    if inject_todo_spec:
        return True
    return focus_requested and todo_has_spec_content(item)


def spec_focus_preamble_applies(
    *,
    focus_requested: bool,
    item: TodoItem | None,
) -> bool:
    """Generic spec-focus instructions only when an active task has real spec layers."""
    return bool(focus_requested and item is not None and todo_has_spec_content(item))


def build_user_message_with_spec_context(
    workspace: str | Path,
    message: str,
    *,
    item: TodoItem | None,
    store: TodoStore | None,
    focus_requested: bool,
    inject_todo_spec: bool,
) -> tuple[str, bool, str | None]:
    """
    Prepend task spec + optional spec-focus preamble.

    Returns ``(user_text, spec_focus_active, turn_todo_id)``.
    ``spec_focus_active`` is True when the spec-focus preamble was applied (for callers).
    """
    turn_todo_id: str | None = None
    user_text = message
    if should_inject_task_context(
        focus_requested=focus_requested,
        item=item,
        inject_todo_spec=inject_todo_spec,
    ):
        assert item is not None
        turn_todo_id = item.id
        user_text = format_todo_context(item, store=store) + message
    preamble = spec_focus_preamble_applies(focus_requested=focus_requested, item=item)
    if preamble:
        user_text = build_spec_focus_preamble(workspace) + user_text
    return user_text, preamble, turn_todo_id


def spec_focus_effective_for_api(
    *,
    focus_requested: bool,
    item: TodoItem | None,
    inject_todo_spec: bool,
) -> bool:
    """Whether the UI/API should treat the turn as spec-focus (preamble or task inject)."""
    return spec_focus_preamble_applies(
        focus_requested=focus_requested, item=item
    ) or should_inject_task_context(
        focus_requested=focus_requested,
        item=item,
        inject_todo_spec=inject_todo_spec,
    )


def spec_focus_instructions_snippet() -> str:
    """First line marker used in tests."""
    return SPEC_FOCUS_INSTRUCTIONS.splitlines()[0]
