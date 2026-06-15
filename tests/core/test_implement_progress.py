"""Workspace persistence for spec implementation progress."""

from __future__ import annotations

import unittest

from cecli.utils import GitTemporaryDirectory, make_repo


class TestWorkspaceTodosMaterialize(unittest.TestCase):
    def test_update_materializes_checklist_from_tasks_md(self):
        from bright_vision_core.workspace_todos import WorkspaceTodos
        from cecli.utils import GitTemporaryDirectory, make_repo

        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            api = WorkspaceTodos(temp_dir)
            store = api.load()
            from cecli.spec.todos import TodoItem, _now_iso

            item = TodoItem(
                id="t1",
                title="T",
                tasks_md="",
                checklist=[],
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
            store.todos.append(item)
            api.save(store)

            updated, _ = api.update(
                item.id,
                tasks_md="- [ ] 1. Scaffold (depends: none)\n- [x] 2. Ship\n",
            )
            self.assertEqual(len(updated.checklist), 2)
            self.assertFalse(updated.checklist[0].done)
            self.assertTrue(updated.checklist[1].done)


if __name__ == "__main__":
    unittest.main()
