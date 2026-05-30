"""Spec-focus gating: preamble only with active task + spec layers."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from bright_vision_core.spec_focus import (
    build_user_message_with_spec_context,
    spec_focus_preamble_applies,
    spec_focus_requested,
    todo_has_spec_content,
)
from bright_vision_core.workspace_todos import TodoItem, TodoStore, migrate_todo_layers


def _item(
    *,
    requirements: str = "",
    design: str = "",
    tasks_md: str = "",
) -> TodoItem:
    now = "2026-01-01T00:00:00Z"
    return migrate_todo_layers(
        TodoItem(
            id="task-1",
            title="Git tab",
            spec="",
            requirements=requirements,
            design=design,
            tasks_md=tasks_md,
            depends_on=[],
            branch="",
            pr_url="",
            status="open",
            links=[],
            checklist=[],
            created_at=now,
            updated_at=now,
        )
    )


class TestSpecFocusGating(unittest.TestCase):
    def test_spec_focus_requested_flags(self):
        self.assertTrue(
            spec_focus_requested(
                message_spec_focus=True,
                session_spec_focus=False,
                session_mode="vibe",
            )
        )
        self.assertTrue(
            spec_focus_requested(
                message_spec_focus=False,
                session_spec_focus=False,
                session_mode="spec",
            )
        )

    def test_empty_layers_not_spec_content(self):
        item = _item()
        self.assertFalse(todo_has_spec_content(item))
        self.assertFalse(
            spec_focus_preamble_applies(focus_requested=True, item=item)
        )

    def test_layers_with_requirements_is_spec_content(self):
        item = _item(requirements="### REQ-001\n**WHEN** x **THE** system **SHALL** y")
        self.assertTrue(todo_has_spec_content(item))
        self.assertTrue(
            spec_focus_preamble_applies(focus_requested=True, item=item)
        )

    def test_no_preamble_without_active_task(self):
        with tempfile.TemporaryDirectory() as tmp:
            text, active, tid = build_user_message_with_spec_context(
                tmp,
                "Add revert in Git tab",
                item=None,
                store=None,
                focus_requested=True,
                inject_todo_spec=False,
            )
            self.assertFalse(active)
            self.assertIsNone(tid)
            self.assertEqual(text, "Add revert in Git tab")
            self.assertNotIn("Spec-focus mode", text)

    def test_preamble_with_active_task_and_spec(self):
        with tempfile.TemporaryDirectory() as tmp:
            item = _item(requirements="### REQ-001\n**WHEN** open **THE** UI **SHALL** show revert")
            store = TodoStore(version=1, active_id=item.id, todos=[item])
            text, active, tid = build_user_message_with_spec_context(
                tmp,
                "Implement REQ-001",
                item=item,
                store=store,
                focus_requested=True,
                inject_todo_spec=False,
            )
            self.assertTrue(active)
            self.assertEqual(tid, item.id)
            self.assertIn("Spec-focus mode", text)
            self.assertIn("REQ-001", text)
            self.assertTrue(text.endswith("Implement REQ-001"))

    def test_inject_without_preamble_when_layers_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            item = _item()
            store = TodoStore(version=1, active_id=item.id, todos=[item])
            text, active, tid = build_user_message_with_spec_context(
                tmp,
                "Seed requirements",
                item=item,
                store=store,
                focus_requested=True,
                inject_todo_spec=True,
            )
            self.assertFalse(active)
            self.assertEqual(tid, item.id)
            self.assertIn("[Active task:", text)
            self.assertNotIn("Spec-focus mode", text)


if __name__ == "__main__":
    unittest.main()
