"""LLM e2e: UpdateTodoList with stringified tasks (cecli tool JSON coercion)."""

from __future__ import annotations

import glob
import os
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient

    from bright_vision_core.http_api import app, _sessions
    from bright_vision_core.http_auth import configure_auth, reset_auth_for_tests
except ImportError:
    TestClient = None
    app = None
    configure_auth = None
    reset_auth_for_tests = None

from llm_ollama import (
    ensure_ollama_for_llm_e2e,
    ollama_reachable,
    recover_local_llm_for_tests,
    resolve_vision_model,
)
from llm_client import create_llm_vision_client, stream_session_message
from llm_sse import assistant_text, parse_sse_payload, tool_output_text

from test_agent_llm import _ensure_llm_e2e_workspace

E2E_TODO_MAGIC = "bv-todo-9c2e"

TODO_AGENT_PROMPT = (
    "/agent You must call the UpdateTodoList tool exactly once and no other tools. "
    f'tasks parameter: [{{"task": "{E2E_TODO_MAGIC}", "done": false, "current": true}}]. '
    "Do not run shell commands, do not edit files, do not use SearchReplace or Read."
)


@unittest.skipIf(TestClient is None, "fastapi not installed")
@unittest.skipIf(os.environ.get("E2E_LLM") != "1", "set E2E_LLM=1 to run real LLM tests")
@unittest.skipIf(not ollama_reachable(), "Local LLM not reachable")
class TestTodoListLlm(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ensure_ollama_for_llm_e2e()

    def setUp(self):
        _sessions.clear()
        reset_auth_for_tests()
        configure_auth("127.0.0.1")
        if os.environ.get("BV_TEST_SUITE_ACTIVE") == "1":
            recover_local_llm_for_tests()

    def tearDown(self):
        reset_auth_for_tests()

    def _find_agent_todo(self, workspace: str) -> Path | None:
        hits = glob.glob(
            os.path.join(workspace, ".cecli", "agents", "**", "todo.txt"),
            recursive=True,
        )
        for p in hits:
            path = Path(p)
            if path.is_file() and E2E_TODO_MAGIC in path.read_text(encoding="utf-8"):
                return path
        return None

    def test_update_todo_list_writes_magic_task(self):
        model = resolve_vision_model()
        workspace = _ensure_llm_e2e_workspace()
        client = create_llm_vision_client()
        res = client.post("/sessions", json={"workspace": workspace, "model": model, "auto_yes": True})
        if res.status_code == 400:
            self.skipTest(f"Could not create session: {res.text}")
        self.assertEqual(res.status_code, 200, res.text)
        session_id = res.json()["session_id"]

        turn_cap = float(os.environ.get("BV_SUITE_LLM_TURN_TIMEOUT_S", "300"))
        events: list[dict] = []
        last_err: BaseException | None = None
        for attempt in range(2):
            try:
                events = stream_session_message(
                    client,
                    session_id,
                    TODO_AGENT_PROMPT,
                    timeout_s=turn_cap,
                )
                last_err = None
                break
            except TimeoutError as err:
                last_err = err
                if attempt == 0:
                    recover_local_llm_for_tests()
                    continue
                raise
        if last_err is not None:
            raise last_err
        errors = [e for e in events if e.get("type") == "error"]
        self.assertFalse(errors, errors)
        combined = assistant_text(events) + "\n" + tool_output_text(events)
        todo_path = self._find_agent_todo(workspace)
        tool_ran = "updatetodolist" in combined.lower() or "update todo" in combined.lower()
        self.assertTrue(
            todo_path is not None or (tool_ran and E2E_TODO_MAGIC in combined),
            f"expected {E2E_TODO_MAGIC!r} on disk or in tool output; assistant/tools: {combined[:1200]!r}",
        )
        if todo_path is not None:
            self.assertIn(E2E_TODO_MAGIC, todo_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
