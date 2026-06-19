"""Session auto-advance after implement turn (mocked nested run_message)."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from bright_vision_core.session import Session
from cecli.spec.todos import ChecklistItem, TodoItem, TodoStore, WorkspaceTodos, _now_iso
from cecli.utils import GitTemporaryDirectory

_SUPERPROJECT = Path(__file__).resolve().parents[2]
_IMPLEMENT_FIXTURE = _SUPERPROJECT / "e2e" / "fixtures" / "implement-workspace"
_TASK_ID = "implement-e2e-1"


def _auto_advance_todo() -> TodoItem:
    now = _now_iso()
    tasks_md = """## Implementation tasks

- [ ] 1. Review top-level layout (depends: none)
- [ ] 2. Implement auth token helper in `src/auth/token.ts` (depends: 1)
    - verify: `true`
- [ ] 3. Add unit tests in `src/auth/token.test.ts` (depends: 2)
"""
    return TodoItem(
        id=_TASK_ID,
        title="Implement workspace E2E",
        spec="",
        requirements="### REQ-001\n**WHEN** x **THE** system **SHALL** y",
        design="Overview",
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
            ChecklistItem(
                id="c3",
                text="3. Add unit tests in `src/auth/token.test.ts` (depends: 2)",
                done=False,
            ),
        ],
        created_at=now,
        updated_at=now,
    )


def _step2_message() -> str:
    return (
        "/agent Implement only implementation task 2: "
        "Implement auth token helper in `src/auth/token.ts` (depends: 1)."
    )


@pytest.fixture
def auto_advance_workspace(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("BV_IMPLEMENT_AUTO_ADVANCE", "1")
    monkeypatch.setenv("BV_IMPLEMENT_VERIFY", "1")
    if not _IMPLEMENT_FIXTURE.is_dir():
        pytest.skip("e2e/fixtures/implement-workspace missing")
    with GitTemporaryDirectory() as root:
        for child in _IMPLEMENT_FIXTURE.iterdir():
            dest = Path(root) / child.name
            if child.is_dir():
                shutil.copytree(child, dest)
            else:
                shutil.copy2(child, dest)
        item = _auto_advance_todo()
        WorkspaceTodos(root).save(TodoStore(version=1, active_id=item.id, todos=[item]))
        yield Path(root)


class TestSessionImplementAutoAdvance:
    def test_auto_advance_after_edits_and_verify(
        self, auto_advance_workspace: Path, monkeypatch: pytest.MonkeyPatch
    ):
        advance_messages: list[str] = []
        sse_tool_text: list[str] = []
        original_run_message = Session.run_message

        def wrapped_run_message(self, message, **kwargs):
            if message.startswith("Implement only implementation task 3"):
                advance_messages.append(message)
                yield self.io.emit("done", assistant_text="")
                return
            yield from original_run_message(self, message, **kwargs)

        monkeypatch.setattr(Session, "run_message", wrapped_run_message)
        monkeypatch.setattr(
            "bright_vision_core.implement_verify.run_verify_command",
            lambda *_a, **_k: (True, "ok"),
        )

        session = Session.create(str(auto_advance_workspace), yes=True, dry_run=True)
        gen = session.run_message(
            _step2_message(),
            preproc=False,
            active_todo_id=_TASK_ID,
            inject_todo_spec=True,
            spec_focus=False,
        )
        try:
            for event in gen:
                if event is None:
                    continue
                if event.get("type") == "tool_output":
                    sse_tool_text.append(str(event.get("text") or ""))
                if event.get("type") == "user_message":
                    session.coder.files_edited_by_tools = {"src/auth/token.ts"}
        finally:
            gen.close()

        ring_text = "\n".join(
            str(e.get("text") or "") for e in getattr(session.io, "debug_event_ring", [])
        )
        streamed = "\n".join(sse_tool_text)
        assert "Auto-advancing to step 3" in ring_text
        assert "Auto-advancing to step 3" in streamed
        assert advance_messages
        assert advance_messages[0].startswith("Implement only implementation task 3")

    def test_auto_advance_skipped_without_edits(
        self, auto_advance_workspace: Path, monkeypatch: pytest.MonkeyPatch
    ):
        advance_messages: list[str] = []
        original_run_message = Session.run_message

        def wrapped_run_message(self, message, **kwargs):
            if message.startswith("Implement only implementation task 3"):
                advance_messages.append(message)
            yield from original_run_message(self, message, **kwargs)

        monkeypatch.setattr(Session, "run_message", wrapped_run_message)
        monkeypatch.setattr(
            "bright_vision_core.implement_verify.run_verify_command",
            lambda *_a, **_k: (True, "ok"),
        )

        session = Session.create(str(auto_advance_workspace), yes=True, dry_run=True)
        warnings: list[str] = []
        streamed_warnings: list[str] = []
        gen = session.run_message(
            _step2_message(),
            preproc=False,
            active_todo_id=_TASK_ID,
            inject_todo_spec=True,
        )
        try:
            for event in gen:
                if event is None:
                    continue
                if event.get("type") == "tool_warning":
                    warnings.append(str(event.get("text") or ""))
                    streamed_warnings.append(str(event.get("text") or ""))
        finally:
            gen.close()

        ring_text = "\n".join(
            str(e.get("text") or "") for e in getattr(session.io, "debug_event_ring", [])
        )
        assert "Skipped auto-advance" in ring_text or any(
            "Skipped auto-advance" in w for w in warnings + streamed_warnings
        )
        assert not advance_messages
