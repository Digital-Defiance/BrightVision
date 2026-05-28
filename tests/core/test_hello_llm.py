"""Real Ollama turn — opt-in with E2E_LLM=1 (same stack as e2e/hello-llm.spec.ts)."""

from __future__ import annotations

import json
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

from cecli.utils import GitTemporaryDirectory

from llm_ollama import ensure_ollama_for_llm_e2e, ollama_reachable, resolve_vision_model
from llm_client import stream_session_message


def _parse_sse_payload(raw: str) -> list[dict]:
    events: list[dict] = []
    for part in raw.split("\n\n"):
        for line in part.split("\n"):
            if not line.startswith("data: "):
                continue
            events.append(json.loads(line[6:]))
    return events


@unittest.skipIf(TestClient is None, "fastapi not installed")
@unittest.skipIf(os.environ.get("E2E_LLM") != "1", "set E2E_LLM=1 to run real LLM tests")
@unittest.skipIf(not ollama_reachable(), "Ollama not reachable")
class TestHelloLlm(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ensure_ollama_for_llm_e2e()

    def setUp(self):
        _sessions.clear()
        reset_auth_for_tests()
        configure_auth("127.0.0.1")

    def tearDown(self):
        reset_auth_for_tests()

    def test_hello_message_streams_tokens_and_done(self):
        model = resolve_vision_model()
        with GitTemporaryDirectory() as root:
            client = TestClient(app)
            res = client.post("/sessions", json={"workspace": root, "model": model})
            if res.status_code == 400:
                self.skipTest(f"Could not create session: {res.text}")
            self.assertEqual(res.status_code, 200, res.text)
            session_id = res.json()["session_id"]

            events = stream_session_message(
                client, session_id, "Reply with exactly: hello from pytest"
            )
            types = [e.get("type") for e in events]
            errors = [e for e in events if e.get("type") == "error"]
            self.assertFalse(errors, errors)
            self.assertIn("user_message", types)
            self.assertIn("done", types, f"events: {types}")
            tokens = [e.get("text", "") for e in events if e.get("type") == "token"]
            assistant = "".join(tokens)
            done = next(e for e in events if e.get("type") == "done")
            if not assistant:
                assistant = done.get("assistant_text") or ""
            self.assertTrue(
                len(assistant.strip()) > 3,
                f"expected non-empty assistant text, got {assistant!r}",
            )
            self.assertFalse(done.get("error"), done)


if __name__ == "__main__":
    unittest.main()
