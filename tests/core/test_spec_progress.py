"""BrightVision shim + implement_verify integration with unified spec progress."""

from __future__ import annotations

import unittest

from bright_vision_core.implement_verify import next_step_after, parse_open_steps
from bright_vision_core.spec_progress import (
    mark_implementation_step_done,
    merge_agent_progress_into_tasks_md,
    try_mark_focus_step_complete,
)
from cecli.spec.agent_todos import AgentTodoRow
from cecli.spec.todos import ChecklistItem, TodoItem, _now_iso


def _item(
    *,
    tasks_md: str,
    checklist: list[ChecklistItem] | None = None,
) -> TodoItem:
    return TodoItem(
        id="t1",
        title="Feature",
        tasks_md=tasks_md,
        checklist=checklist or [],
        created_at=_now_iso(),
        updated_at=_now_iso(),
    )


class TestSpecProgressShim(unittest.TestCase):
    def test_shim_exports_merge(self):
        tasks_md = "- [ ] 1. Wire module\n"
        rows = [AgentTodoRow(text="1. Wire module", done=True, current=False)]
        merged = merge_agent_progress_into_tasks_md(tasks_md, rows)
        self.assertIn("- [x] 1. Wire module", merged)

    def test_try_mark_via_shim_on_verify_pass(self):
        item = _item(
            tasks_md="- [ ] 1. Run lint\n  - verify: `true`\n",
            checklist=[ChecklistItem(id="a", text="1. Run lint", done=False)],
        )
        updated, changed = try_mark_focus_step_complete(
            item, "1", flutter_test_ok=None, verify_ok=True
        )
        self.assertTrue(changed)
        self.assertTrue(updated.checklist[0].done)


class TestImplementVerifyUsesUnifiedProgress(unittest.TestCase):
    def test_next_step_after_prefers_checklist_when_tasks_md_stale(self):
        """Regression: checklist all done but tasks_md still shows open steps."""
        item = _item(
            tasks_md="- [ ] 1.1 First\n- [ ] 1.2 Second\n- [ ] 1.3 Third\n",
            checklist=[
                ChecklistItem(id="a", text="1.1 First", done=True),
                ChecklistItem(id="b", text="1.2 Second", done=True),
                ChecklistItem(id="c", text="1.3 Third", done=True),
            ],
        )
        self.assertEqual(next_step_after(item.tasks_md, "1.3"), "1.1")
        self.assertIsNone(next_step_after(item.tasks_md, "1.3", item=item))

    def test_parse_open_steps_uses_checklist_when_item_given(self):
        item = _item(
            tasks_md="- [ ] 1.1 First\n- [ ] 1.2 Second\n",
            checklist=[
                ChecklistItem(id="a", text="1.1 First", done=True),
                ChecklistItem(id="b", text="1.2 Second", done=False),
            ],
        )
        self.assertEqual(parse_open_steps(item.tasks_md), ["1.1", "1.2"])
        self.assertEqual(parse_open_steps(item.tasks_md, item=item), ["1.2"])

    def test_mark_done_updates_both_layers_for_auto_advance(self):
        item = _item(
            tasks_md="- [ ] 1. Wire\n- [ ] 2. Test\n",
            checklist=[
                ChecklistItem(id="a", text="1. Wire", done=False),
                ChecklistItem(id="b", text="2. Test", done=False),
            ],
        )
        updated = mark_implementation_step_done(item, "1", done=True)
        self.assertTrue(updated.checklist[0].done)
        self.assertIn("- [x] 1. Wire", updated.tasks_md)
        self.assertEqual(next_step_after(updated.tasks_md, "1", item=updated), "2")


if __name__ == "__main__":
    unittest.main()
