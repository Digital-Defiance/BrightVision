"""LLM e2e: /add fixture file and emit SEARCH/REPLACE for edit-block workspace."""

from __future__ import annotations

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
from llm_sse import assistant_text

REPO_ROOT = Path(__file__).resolve().parents[2]
EDIT_WORKSPACE = REPO_ROOT / "e2e" / "fixtures" / "edit-block-workspace"
PATCH_REL = "src/patchme.ts"
OLD_LINE = "export const value = 'old';\n"
NEW_LINE = "export const value = 'new';\n"


def _ensure_edit_workspace() -> str:
    EDIT_WORKSPACE.mkdir(parents=True, exist_ok=True)
    patch = EDIT_WORKSPACE / PATCH_REL
    patch.parent.mkdir(parents=True, exist_ok=True)
    readme = EDIT_WORKSPACE / "README.md"
    if not readme.exists():
        readme.write_text("# E2E edit-block workspace\n", encoding="utf8")
    patch.write_text(OLD_LINE, encoding="utf8")
    if not (EDIT_WORKSPACE / ".git").exists():
        subprocess.run(["git", "init", "-b", "main"], cwd=EDIT_WORKSPACE, check=True, capture_output=True)
        subprocess.run(["git", "add", "README.md", PATCH_REL], cwd=EDIT_WORKSPACE, check=True, capture_output=True)
        subprocess.run(
            [
                "git",
                "-c",
                "user.email=e2e@test",
                "-c",
                "user.name=e2e",
                "commit",
                "-m",
                "e2e edit-block",
            ],
            cwd=EDIT_WORKSPACE,
            check=True,
            capture_output=True,
        )
    return str(EDIT_WORKSPACE)


@unittest.skipIf(TestClient is None, "fastapi not installed")
@unittest.skipIf(os.environ.get("E2E_LLM") != "1", "set E2E_LLM=1 to run real LLM tests")
@unittest.skipIf(not ollama_reachable(), "Ollama not reachable")
class TestEditBlockLlm(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ensure_ollama_for_llm_e2e()

    def setUp(self):
        _sessions.clear()
        reset_auth_for_tests()
        configure_auth("127.0.0.1")

    def tearDown(self):
        reset_auth_for_tests()

    def test_add_patch_file_then_search_replace_block(self):
        model = resolve_vision_model()
        workspace = _ensure_edit_workspace()
        client = TestClient(app)
        res = client.post("/sessions", json={"workspace": workspace, "model": model, "auto_yes": True})
        if res.status_code == 400:
            self.skipTest(f"Could not create session: {res.text}")
        self.assertEqual(res.status_code, 200, res.text)
        session_id = res.json()["session_id"]

        add_events = stream_session_message(client, session_id, f"/add {PATCH_REL}")
        self.assertFalse([e for e in add_events if e.get("type") == "error"])

        prompt = (
            f"In {PATCH_REL}, change the string 'old' to 'new' in the export. "
            "Reply with a single fenced SEARCH/REPLACE block only (no shell, no other files)."
        )
        events = stream_session_message(client, session_id, prompt)
        errors = [e for e in events if e.get("type") == "error"]
        self.assertFalse(errors, errors)
        reply = assistant_text(events)
        self.assertRegex(reply, r"<<<<<<<|SEARCH|REPLACE", msg=f"expected SEARCH/REPLACE in: {reply[:600]!r}")
        self.assertIn("new", reply.lower())


if __name__ == "__main__":
    unittest.main()
