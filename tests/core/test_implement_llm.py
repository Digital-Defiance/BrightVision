"""LLM e2e: implement turn on generic fixture (ContextManager create + EditText on named path)."""

from __future__ import annotations

import os
import shutil
import subprocess
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient

    from bright_vision_core.http_api import app
    from bright_vision_core.http_auth import configure_auth, reset_auth_for_tests
except ImportError:
    TestClient = None
    app = None
    configure_auth = None
    reset_auth_for_tests = None

from llm_client import create_llm_vision_client, stream_session_message
from llm_ollama import (
    ensure_ollama_for_llm_e2e,
    ollama_reachable,
    probe_local_llm_chat,
    recover_local_llm_for_tests,
    reset_vision_sessions_for_tests,
    resolve_vision_model,
)
from llm_sse import tool_output_text, user_message_text

REPO_ROOT = Path(__file__).resolve().parents[2]
IMPLEMENT_FIXTURE = REPO_ROOT / "e2e" / "fixtures" / "implement-workspace"
TASK_ID = "implement-e2e-1"
TOKEN_REL = "src/auth/token.ts"


def _resolve_code_model() -> str:
    from llm_ollama import resolve_code_vision_model

    return resolve_code_vision_model()


def _ensure_implement_workspace() -> str:
    root = REPO_ROOT / "e2e" / "fixtures" / "implement-workspace-llm"
    if root.exists():
        shutil.rmtree(root)
    shutil.copytree(IMPLEMENT_FIXTURE, root)
    token = root / TOKEN_REL
    if token.exists():
        token.unlink()
    from cecli.spec.todos import ChecklistItem, TodoItem, TodoStore, WorkspaceTodos, _now_iso

    now = _now_iso()
    tasks_md = """## Implementation tasks

- [ ] 1. Review top-level layout (depends: none)
- [ ] 2. Implement auth token helper in `src/auth/token.ts` (depends: 1)
"""
    item = TodoItem(
        id=TASK_ID,
        title="Implement workspace E2E",
        spec="",
        requirements="### REQ-001\n**WHEN** a client calls the API\n**THE** system **SHALL** expose a token helper\n",
        design="## Overview\n\nMinimal Node auth helper module.\n",
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
    WorkspaceTodos(root).save(TodoStore(version=1, active_id=item.id, todos=[item]))
    if not (root / ".git").exists():
        subprocess.run(["git", "init", "-b", "main"], cwd=root, check=True, capture_output=True)
        subprocess.run(
            ["git", "add", "."],
            cwd=root,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "git",
                "-c",
                "user.email=e2e@test",
                "-c",
                "user.name=e2e",
                "commit",
                "-m",
                "e2e implement-llm",
            ],
            cwd=root,
            check=True,
            capture_output=True,
        )
    return str(root)


def _implement_message() -> str:
    return (
        "/agent Implement only implementation task 2: Implement auth token helper in "
        "`src/auth/token.ts` (depends: 1). Use ContextManager create on the missing file, "
        "then ReadRange and EditText. Export a function getToken(): string. "
        "Do not ls or explore other paths."
    )


@unittest.skipIf(TestClient is None, "fastapi not installed")
@unittest.skipIf(os.environ.get("E2E_LLM") != "1", "set E2E_LLM=1 to run real LLM tests")
@unittest.skipIf(not ollama_reachable(), "Local LLM not reachable")
class TestImplementLlm(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ensure_ollama_for_llm_e2e()

    def setUp(self):
        reset_vision_sessions_for_tests()
        reset_auth_for_tests()
        configure_auth("127.0.0.1")

    def tearDown(self):
        reset_auth_for_tests()

    def test_implement_turn_injects_workspace_and_may_create_token_file(self):
        model = _resolve_code_model()
        workspace = _ensure_implement_workspace()
        turn_cap = float(os.environ.get("BV_SUITE_LLM_TURN_TIMEOUT_S", "600"))
        in_suite = os.environ.get("BV_TEST_SUITE_ACTIVE") == "1"
        message = _implement_message()
        events: list[dict] = []
        last_err: BaseException | None = None

        for attempt in range(2):
            client = create_llm_vision_client()
            if attempt > 0:
                recover_local_llm_for_tests()
                reset_vision_sessions_for_tests()
            probe_local_llm_chat()
            reset_auth_for_tests()
            configure_auth("127.0.0.1")
            res = client.post(
                "/sessions",
                json={"workspace": workspace, "model": model, "auto_yes": True},
            )
            if res.status_code == 400:
                self.skipTest(f"Could not create session: {res.text}")
            session_id = res.json()["session_id"]
            try:
                events = stream_session_message(
                    client,
                    session_id,
                    message,
                    preproc=True,
                    timeout_s=turn_cap,
                    active_todo_id=TASK_ID,
                    inject_todo_spec=True,
                    spec_focus=False,
                )
                last_err = None
            except TimeoutError as err:
                last_err = err
                if attempt == 0 and in_suite and os.environ.get("BV_TEST_SUITE_SHORT_CIRCUIT") != "1":
                    continue
                raise
            errors = [e for e in events if e.get("type") == "error"]
            if errors and attempt == 0 and in_suite:
                continue
            if errors:
                self.fail(str(errors))
            if user_message_text(events).strip():
                break
            if attempt == 0 and in_suite:
                continue
        if last_err is not None:
            raise last_err

        expanded = user_message_text(events)
        self.assertIn("Workspace snapshot", expanded)
        self.assertIn("src/auth/token.ts", expanded)
        self.assertNotIn("Yield rejected", tool_output_text(events))

        token_path = Path(workspace) / TOKEN_REL
        tools = tool_output_text(events).lower()
        created_on_disk = token_path.is_file() and token_path.read_text(encoding="utf-8").strip()
        tool_success = "edittext" in tools or "contextmanager" in tools or "successfully" in tools
        self.assertTrue(
            created_on_disk or tool_success,
            "expected EditText/ContextManager activity or token file on disk",
        )


if __name__ == "__main__":
    unittest.main()
