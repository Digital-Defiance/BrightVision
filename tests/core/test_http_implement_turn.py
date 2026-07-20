"""Session + HTTP tests for implement turns (production Tasks-tab path).

Mocks and unit tests on ``build_implement_workspace_block`` alone miss the gap where
``Session.run_message`` / POST ``/messages`` must expand the user prompt before the LLM.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from bright_vision_core.http_api import app
from bright_vision_core.session import Session
from cecli.spec.todos import ChecklistItem, TodoItem, TodoStore, WorkspaceTodos, _now_iso
from cecli.utils import GitTemporaryDirectory

_SUPERPROJECT = Path(__file__).resolve().parents[2]
_IMPLEMENT_FIXTURE = _SUPERPROJECT / "e2e" / "fixtures" / "implement-workspace"
_TASK_ID = "implement-e2e-1"

_REQ = """### REQ-001
**WHEN** a client calls the API
**THE** system **SHALL** handle the request in `src/api/handler.ts`
"""

_DESIGN = """## Overview

Minimal Node service with auth helper and HTTP handler modules.
"""


def _named_path_todo() -> TodoItem:
    now = _now_iso()
    tasks_md = """## Implementation tasks

- [ ] 1. Review top-level layout (depends: none)
- [ ] 2. Implement auth token helper in `src/auth/token.ts` (depends: 1)
"""
    return TodoItem(
        id=_TASK_ID,
        title="Implement workspace E2E",
        spec="",
        requirements=_REQ,
        design=_DESIGN,
        tasks_md=tasks_md,
        depends_on=[],
        branch="",
        pr_url="",
        status="in_progress",
        links=[],
        checklist=[
            ChecklistItem(id="c1", text="1. Review top-level layout (depends: none)", done=False),
            ChecklistItem(
                id="c2",
                text="2. Implement auth token helper in `src/auth/token.ts` (depends: 1)",
                done=False,
            ),
        ],
        created_at=now,
        updated_at=now,
    )


def _implement_step_message() -> str:
    return (
        "/agent Implement only implementation task 2: "
        "Implement auth token helper in `src/auth/token.ts` (depends: 1). "
        "Do not implement other numbered tasks in this turn unless required as a direct dependency."
    )


def _resume_message() -> str:
    return (
        "/agent Continue the active task from where you stopped. "
        "A **workspace snapshot** is injected — do **not** ls, Grep, or GitStatus. "
        "Use ReadRange + EditText on the **Next action** file only. "
        "Do not reset completed checklist items; work the next incomplete item."
    )


@pytest.fixture
def implement_workspace():
    if not _IMPLEMENT_FIXTURE.is_dir():
        pytest.skip("e2e/fixtures/implement-workspace missing")
    with GitTemporaryDirectory() as root:
        for child in _IMPLEMENT_FIXTURE.iterdir():
            dest = Path(root) / child.name
            if child.is_dir():
                shutil.copytree(child, dest)
            else:
                shutil.copy2(child, dest)
        item = _named_path_todo()
        store = TodoStore(version=1, active_id=item.id, todos=[item])
        WorkspaceTodos(root).save(store)
        yield Path(root)


def _first_user_message(session: Session, message: str, **kwargs: object) -> str:
    gen = session.run_message(message, preproc=False, **kwargs)
    try:
        for event in gen:
            if event.get("type") == "user_message":
                return str(event.get("text") or "")
    finally:
        gen.close()
    return ""


def _sse_user_message(response) -> str:
    for line in response.iter_lines():
        if isinstance(line, bytes):
            line = line.decode("utf-8", errors="replace")
        if not line or not line.startswith("data: "):
            continue
        payload = json.loads(line[6:])
        if payload.get("type") == "user_message":
            return str(payload.get("text") or "")
    return ""


class TestSessionImplementTurn:
    def test_run_message_expands_tasks_tab_implement_without_spec_focus(self, implement_workspace: Path):
        session = Session.create(
            str(implement_workspace),
            yes=True,
            dry_run=True,
        )
        text = _first_user_message(
            session,
            _implement_step_message(),
            active_todo_id=_TASK_ID,
            inject_todo_spec=True,
            spec_focus=False,
        )
        assert "Workspace snapshot" in text
        assert "Implementation turn (tools)" in text
        assert "ContextManager create" in text
        assert "src/auth/token.ts" in text
        assert "Spec-focus mode (BrightVision)" not in text
        assert text.strip().endswith(_implement_step_message())

    def test_run_message_expands_tasks_tab_implement_with_spec_focus(self, implement_workspace: Path):
        session = Session.create(
            str(implement_workspace),
            yes=True,
            dry_run=True,
        )
        text = _first_user_message(
            session,
            _implement_step_message(),
            active_todo_id=_TASK_ID,
            inject_todo_spec=True,
            spec_focus=True,
        )
        assert "Workspace snapshot" in text
        assert "Spec-focus mode (BrightVision)" in text
        assert "src/auth/token.ts" in text
        assert text.strip().endswith(_implement_step_message())

    def test_run_message_resume_injects_workspace_without_reinject(self, implement_workspace: Path):
        session = Session.create(
            str(implement_workspace),
            yes=True,
            dry_run=True,
        )
        text = _first_user_message(
            session,
            _resume_message(),
            active_todo_id=_TASK_ID,
            inject_todo_spec=False,
            spec_focus=False,
        )
        assert "Workspace snapshot" in text
        assert "[Active task:" not in text
        assert text.strip().endswith(_resume_message())

    def test_yield_guard_rejects_without_edittext_on_implement(self, implement_workspace: Path):
        session = Session.create(
            str(implement_workspace),
            yes=True,
            dry_run=True,
        )
        gen = session.run_message(
            _implement_step_message(),
            preproc=False,
            active_todo_id=_TASK_ID,
            inject_todo_spec=True,
        )
        try:
            for event in gen:
                if event.get("type") == "user_message":
                    break
        finally:
            gen.close()

        reject = session.coder.reject_yield
        assert reject is not None
        assert "Yield rejected" in (reject(session.coder) or "")
        session.coder.files_edited_by_tools = {"src/auth/token.ts"}
        assert reject(session.coder) is None

    def test_expanded_message_matches_spec_context_builder(self, implement_workspace: Path):
        from bright_vision_core.spec_focus import build_user_message_with_spec_context

        store = WorkspaceTodos(implement_workspace).load()
        item = store.todos[0]
        msg = _implement_step_message()
        expected, _, _ = build_user_message_with_spec_context(
            implement_workspace,
            msg,
            item=item,
            store=store,
            focus_requested=False,
            inject_todo_spec=True,
        )
        session = Session.create(str(implement_workspace), yes=True, dry_run=True)
        actual = _first_user_message(
            session,
            msg,
            active_todo_id=_TASK_ID,
            inject_todo_spec=True,
            spec_focus=False,
        )
        assert actual == expected

    def test_pathless_step_injects_task_guidance_not_layout_guess(self, implement_workspace: Path):
        now = _now_iso()
        pathless = TodoItem(
            id=_TASK_ID,
            title="Implement workspace E2E",
            spec="",
            requirements=_REQ,
            design=_DESIGN,
            tasks_md="- [ ] 1. Scaffold the workspace and shared tooling (depends: none)",
            depends_on=[],
            branch="",
            pr_url="",
            status="in_progress",
            links=[],
            checklist=[
                ChecklistItem(
                    id="c1",
                    text="1. Scaffold the workspace and shared tooling (depends: none)",
                    done=False,
                ),
            ],
            created_at=now,
            updated_at=now,
        )
        WorkspaceTodos(implement_workspace).save(
            TodoStore(version=1, active_id=pathless.id, todos=[pathless])
        )
        msg = (
            "/agent Implement only implementation task 1: "
            "Scaffold the workspace and shared tooling (depends: none)."
        )
        session = Session.create(str(implement_workspace), yes=True, dry_run=True)
        text = _first_user_message(
            session,
            msg,
            active_todo_id=_TASK_ID,
            inject_todo_spec=True,
            spec_focus=False,
        )
        assert "names **no file paths**" in text
        assert "Workspace snapshot" in text


class TestHttpImplementTurn:
    def test_post_messages_sse_expands_implement_turn(self, implement_workspace: Path):
        client = TestClient(app)
        created = client.post(
            "/sessions",
            json={"workspace": str(implement_workspace), "model": "gpt-4o", "auto_yes": True},
        )
        if created.status_code == 400:
            pytest.skip(f"Could not create session: {created.text}")
        assert created.status_code == 200
        session_id = created.json()["session_id"]

        res = client.post(
            f"/sessions/{session_id}/messages",
            json={
                "content": _implement_step_message(),
                "preproc": False,
                "active_todo_id": _TASK_ID,
                "inject_todo_spec": True,
                "spec_focus": False,
            },
        )
        assert res.status_code == 200
        text = _sse_user_message(res)
        assert "Workspace snapshot" in text
        assert "src/auth/token.ts" in text
