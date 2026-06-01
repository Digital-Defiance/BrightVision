"""Real Ollama /agent slash — opt-in with E2E_LLM=1 (pairs with e2e/agent-llm.spec.ts)."""

from __future__ import annotations

import json
import os
import subprocess
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

from llm_ollama import ensure_ollama_for_llm_e2e, ollama_reachable, resolve_vision_model
from llm_client import stream_session_message

REPO_ROOT = Path(__file__).resolve().parents[2]
LLM_E2E_WORKSPACE = REPO_ROOT / "e2e" / "fixtures" / "hello-workspace"

AGENT_PROMPT = (
    "/agent Reply with exactly: hello from agent pytest. "
    "Do not run shell commands, do not edit files, do not use tools."
)


def _ensure_llm_e2e_workspace() -> str:
    """Same minimal repo as e2e/hello-llm (committed README; .git on first run)."""
    LLM_E2E_WORKSPACE.mkdir(parents=True, exist_ok=True)
    readme = LLM_E2E_WORKSPACE / "README.md"
    if not readme.exists():
        readme.write_text("# E2E hello workspace\n", encoding="utf8")
    if not (LLM_E2E_WORKSPACE / ".git").exists():
        subprocess.run(
            [
                "git",
                "init",
                "-b",
                "main",
            ],
            cwd=LLM_E2E_WORKSPACE,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "add", "README.md"],
            cwd=LLM_E2E_WORKSPACE,
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
                "e2e init",
            ],
            cwd=LLM_E2E_WORKSPACE,
            check=True,
            capture_output=True,
        )
    return str(LLM_E2E_WORKSPACE)


def _parse_sse_payload(raw: str) -> list[dict]:
    events: list[dict] = []
    for part in raw.split("\n\n"):
        for line in part.split("\n"):
            if not line.startswith("data: "):
                continue
            events.append(json.loads(line[6:]))
    return events


def _event_texts(events: list[dict]) -> str:
    chunks: list[str] = []
    for e in events:
        if e.get("type") in ("error", "tool_error", "tool_output", "token", "done"):
            chunks.append(str(e.get("text") or e.get("assistant_text") or ""))
    return "\n".join(chunks)


@unittest.skipIf(TestClient is None, "fastapi not installed")
@unittest.skipIf(os.environ.get("E2E_LLM") != "1", "set E2E_LLM=1 to run real LLM tests")
@unittest.skipIf(not ollama_reachable(), "Ollama not reachable")
class TestAgentLlm(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ensure_ollama_for_llm_e2e()

    def setUp(self):
        _sessions.clear()
        reset_auth_for_tests()
        configure_auth("127.0.0.1")

    def tearDown(self):
        reset_auth_for_tests()

    def test_agent_slash_streams_done_without_verbose_error(self):
        model = resolve_vision_model()
        root = _ensure_llm_e2e_workspace()
        client = TestClient(app)
        res = client.post("/sessions", json={"workspace": root, "model": model})
        if res.status_code == 400:
            self.skipTest(f"Could not create session: {res.text}")
        self.assertEqual(res.status_code, 200, res.text)
        session_id = res.json()["session_id"]

        events = stream_session_message(client, session_id, AGENT_PROMPT)
        types = [e.get("type") for e in events]
        errors = [e for e in events if e.get("type") == "error"]
        self.assertFalse(errors, errors)

        combined = _event_texts(events)
        self.assertNotIn("has no attribute 'verbose'", combined)
        self.assertNotIn('has no attribute "verbose"', combined)
        self.assertNotIn("Unable to complete agent", combined)

        self.assertIn("user_message", types)
        self.assertIn("done", types, f"events: {types}")
        done = next(e for e in events if e.get("type") == "done")
        self.assertFalse(done.get("error"), done)

        tokens = [e.get("text", "") for e in events if e.get("type") == "token"]
        assistant = "".join(tokens) or (done.get("assistant_text") or "")
        self.assertTrue(
            len(assistant.strip()) > 3,
            f"expected non-empty assistant text, got {assistant!r}",
        )


if __name__ == "__main__":
    unittest.main()
