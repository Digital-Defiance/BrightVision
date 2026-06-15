"""Session implement auto-mark via persist_auto_mark_implement_step."""

from __future__ import annotations

from pathlib import Path

from bright_vision_core.implement_progress import (
    implementation_progress_payload,
    persist_auto_mark_implement_step,
)
from cecli.spec.todos import ChecklistItem, TodoItem, WorkspaceTodos, _now_iso


def test_persist_auto_mark_on_verify_pass(tmp_path: Path):
    api = WorkspaceTodos(tmp_path)
    store = api.load()
    item = TodoItem(
        id="t1",
        title="Feature",
        tasks_md="- [ ] 1.1 Run lint\n  - verify: `true`\n",
        checklist=[ChecklistItem(id="a", text="1.1 Run lint", done=False)],
        status="in_progress",
        created_at=_now_iso(),
        updated_at=_now_iso(),
    )
    store.todos.append(item)
    store.active_id = item.id
    api.save(store)

    persisted, changed = persist_auto_mark_implement_step(
        tmp_path,
        item,
        focus_step="1.1",
        flutter_test_ok=None,
        verify_ok=True,
    )
    assert changed is True
    assert persisted is not None
    assert persisted.checklist[0].done is True
    assert "- [x] 1.1 Run lint" in persisted.tasks_md

    on_disk = api.load().todos[0]
    assert on_disk.checklist[0].done is True


def test_persist_auto_mark_skipped_when_verify_fails(tmp_path: Path):
    item = TodoItem(
        id="t1",
        title="Feature",
        tasks_md="- [ ] 1.1 Run lint\n",
        checklist=[ChecklistItem(id="a", text="1.1 Run lint", done=False)],
        created_at=_now_iso(),
        updated_at=_now_iso(),
    )
    persisted, changed = persist_auto_mark_implement_step(
        tmp_path,
        item,
        focus_step="1.1",
        flutter_test_ok=None,
        verify_ok=False,
    )
    assert changed is False
    assert persisted is None


def test_implementation_progress_payload():
    item = TodoItem(
        id="t1",
        title="Feature",
        tasks_md="- [x] 1.1 Done\n- [ ] 1.2 Next\n",
        checklist=[
            ChecklistItem(id="a", text="1.1 Done", done=True),
            ChecklistItem(id="b", text="1.2 Next", done=False),
        ],
        created_at=_now_iso(),
        updated_at=_now_iso(),
    )
    payload = implementation_progress_payload(item)
    assert payload["next_open"]["step_id"] == "1.2"
    assert len(payload["steps"]) == 2
