"""Implement-turn contracts: tool JSON coercion, routing, auto-advance guards."""

from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path

import pytest

from bright_vision_core.session import Session
from cecli.hopper.router import RouteTurnContext
from cecli.spec.todos import ChecklistItem, TodoItem, TodoStore, WorkspaceTodos, _now_iso
from cecli.tools._yield import Tool
from cecli.utils import GitTemporaryDirectory

_SUPERPROJECT = Path(__file__).resolve().parents[2]
_IMPLEMENT_FIXTURE = _SUPERPROJECT / "e2e" / "fixtures" / "implement-workspace"
_TASK_ID = "implement-e2e-1"


def _implement_step_message() -> str:
    return (
        "/agent Implement only implementation task 2: "
        "Implement auth token helper in `src/auth/token.ts` (depends: 1)."
    )


@pytest.fixture
def implement_workspace():
    if not _IMPLEMENT_FIXTURE.is_dir():
        pytest.skip("e2e/fixtures/implement-workspace missing")
    now = _now_iso()
    item = TodoItem(
        id=_TASK_ID,
        title="Implement workspace E2E",
        spec="",
        requirements="### REQ-001\n**WHEN** x **THE** system **SHALL** y",
        design="Overview",
        tasks_md="- [ ] 2. Implement auth token helper in `src/auth/token.ts` (depends: 1)",
        depends_on=[],
        branch="",
        pr_url="",
        status="in_progress",
        links=[],
        checklist=[
            ChecklistItem(
                id="c2",
                text="2. Implement auth token helper in `src/auth/token.ts` (depends: 1)",
                done=False,
            ),
        ],
        created_at=now,
        updated_at=now,
    )
    with GitTemporaryDirectory() as root:
        for child in _IMPLEMENT_FIXTURE.iterdir():
            dest = Path(root) / child.name
            if child.is_dir():
                shutil.copytree(child, dest)
            else:
                shutil.copy2(child, dest)
        WorkspaceTodos(root).save(TodoStore(version=1, active_id=item.id, todos=[item]))
        yield Path(root)


class TestEditTextToolJsonCoercion:
    """Local models glue/split tool args — must not break EditText / UpdateTodoList."""

    @pytest.mark.parametrize(
        "raw,expected_keys",
        [
            (
                '{"path": "src/auth/token.ts"}{"start_line": 1}{"end_line": 1}',
                {"path", "start_line", "end_line"},
            ),
            (
                '{"path": "src/auth/token.ts", "content": "export const x = 1\\n"}{}',
                {"path", "content"},
            ),
            (
                '{"limit": 15}{}{"path": "src/auth/token.ts"}',
                {"limit", "path"},
            ),
        ],
    )
    def test_parse_tool_arguments_merges_edittext_fragments(self, raw: str, expected_keys: set[str]):
        from cecli.helpers.responses import parse_tool_arguments

        parsed = parse_tool_arguments(raw)
        assert "@error" not in parsed
        assert expected_keys <= set(parsed.keys())

    def test_char_split_update_todo_list_array(self):
        from cecli.helpers.responses import try_join_char_split_json_array

        chars = list('[{"task": "Ship", "done": false}]')
        parsed = try_join_char_split_json_array(chars)
        assert parsed == [{"task": "Ship", "done": False}]

    def test_repair_newline_before_string_value(self):
        from cecli.helpers.responses import try_parse_json_value

        broken = '{"path": "a.ts", "end_text":\n", "start_text": ""}'
        parsed = try_parse_json_value(broken)
        assert isinstance(parsed, dict)
        assert parsed.get("path") == "a.ts"


class TestImplementTurnRouting:
    def test_session_routes_implement_to_code_tier(self, implement_workspace: Path):
        session = Session.create(
            str(implement_workspace),
            yes=True,
            dry_run=True,
            model_router={
                "enabled": True,
                "fast_model": "ollama_chat/fast",
                "code_model": "ollama_chat/code",
                "think_model": "ollama_chat/think",
                "model_pool": [
                    {"model": "ollama_chat/fast", "tier": "fast", "enabled": True},
                    {"model": "ollama_chat/code", "tier": "code", "enabled": True},
                    {"model": "ollama_chat/think", "tier": "think", "enabled": True},
                ],
            },
        )
        decision = session._route_and_apply(
            _implement_step_message(),
            intent_message=_implement_step_message(),
            force_tier="code",
            turn=RouteTurnContext(
                agent_cmd=True,
                implement_turn=True,
                inject_todo_spec=True,
            ),
        )
        assert decision is not None
        assert decision.role == "code"
        assert decision.model_name == "ollama_chat/code"


class TestYieldGuardExecution:
    def test_yield_tool_rejects_without_edittext_on_implement(self, implement_workspace: Path):
        session = Session.create(str(implement_workspace), yes=True, dry_run=True)
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

        result = asyncio.run(Tool.execute(session.coder, summary="done without edits"))
        assert "Yield rejected" in result
        assert not getattr(session.coder, "agent_finished", False)

        session.coder.files_edited_by_tools = {"src/auth/token.ts"}
        ok = asyncio.run(Tool.execute(session.coder, summary="after edit"))
        assert "Yield rejected" not in ok


class TestAutoAdvanceGuard:
    def test_saved_workspace_edits_requires_edittext_paths(self):
        from types import SimpleNamespace

        from bright_vision_core.session import _saved_workspace_edits

        empty = SimpleNamespace(files_edited_by_tools=set())
        assert _saved_workspace_edits(empty) == []

        edited = SimpleNamespace(files_edited_by_tools={"src/auth/token.ts"})
        assert _saved_workspace_edits(edited) == ["src/auth/token.ts"]

    def test_implement_auto_mark_not_called_without_edits_in_session(self, implement_workspace: Path):
        """Session._maybe_auto_mark_implement_step returns early without files_edited_by_tools."""
        from bright_vision_core.session import _saved_workspace_edits

        session = Session.create(str(implement_workspace), yes=True, dry_run=True)
        assert _saved_workspace_edits(session.coder) == []
