"""LLM e2e: transcript API returns user/assistant rows after a chat turn."""

from __future__ import annotations

import os
import unittest

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

from test_agent_llm import _ensure_llm_e2e_workspace


@unittest.skipIf(TestClient is None, "fastapi not installed")
@unittest.skipIf(os.environ.get("E2E_LLM") != "1", "set E2E_LLM=1 to run real LLM tests")
@unittest.skipIf(not ollama_reachable(), "Ollama not reachable")
class TestTranscriptLlm(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ensure_ollama_for_llm_e2e()

    def setUp(self):
        _sessions.clear()
        reset_auth_for_tests()
        configure_auth("127.0.0.1")

    def tearDown(self):
        reset_auth_for_tests()

    def test_transcript_includes_user_and_assistant_after_turn(self):
        model = resolve_vision_model()
        workspace = _ensure_llm_e2e_workspace()
        client = TestClient(app)
        res = client.post("/sessions", json={"workspace": workspace, "model": model})
        if res.status_code == 400:
            self.skipTest(f"Could not create session: {res.text}")
        self.assertEqual(res.status_code, 200, res.text)
        session_id = res.json()["session_id"]

        prompt = "Reply with exactly: transcript e2e ok"
        events = stream_session_message(client, session_id, prompt)
        self.assertFalse([e for e in events if e.get("type") == "error"])
        reply = assistant_text(events)
        self.assertIn("transcript", reply.lower())

        tr = client.get(f"/sessions/{session_id}/transcript")
        self.assertEqual(tr.status_code, 200, tr.text)
        rows = tr.json().get("messages") or []
        roles = [r.get("role") for r in rows]
        self.assertIn("user", roles)
        self.assertIn("assistant", roles)
        joined = " ".join(str(r.get("content") or "") for r in rows).lower()
        self.assertIn("transcript", joined)


if __name__ == "__main__":
    unittest.main()
