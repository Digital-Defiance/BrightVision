"""Opt-in cloud LLM smoke — E2E_CLOUD_LLM=1 + credentials in env or cloud-llm.env."""

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

from cloud_llm_env import apply_cloud_llm_env, cloud_llm_configured, resolve_cloud_vision_model
from llm_client import stream_session_message


def _parse_sse_payload(raw: str) -> list[dict]:
    events: list[dict] = []
    for part in raw.split("\n\n"):
        for line in part.split("\n"):
            if not line.startswith("data: "):
                continue
            events.append(json.loads(line[6:]))
    return events


def _cloud_enabled() -> bool:
    return os.environ.get("E2E_CLOUD_LLM", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


@unittest.skipIf(TestClient is None, "fastapi not installed")
@unittest.skipIf(not _cloud_enabled(), "set E2E_CLOUD_LLM=1 to run cloud LLM smoke")
@unittest.skipIf(not cloud_llm_configured(), "set OPENAI_API_KEY (or AZURE_API_KEY) in env or cloud-llm.env")
class TestCloudLlmSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        apply_cloud_llm_env()

    def setUp(self):
        _sessions.clear()
        reset_auth_for_tests()
        configure_auth("127.0.0.1")

    def tearDown(self):
        reset_auth_for_tests()

    def test_openai_compatible_turn_streams_done(self):
        model = resolve_cloud_vision_model()
        with GitTemporaryDirectory() as root:
            client = TestClient(app)
            res = client.post(
                "/sessions",
                json={"workspace": root, "model": model, "auto_yes": True},
            )
            if res.status_code == 400:
                self.skipTest(f"Could not create session: {res.text}")
            self.assertEqual(res.status_code, 200, res.text)
            session_id = res.json()["session_id"]

            events = stream_session_message(
                client,
                session_id,
                "Reply with exactly: cloud pytest ok",
            )
            errors = [e for e in events if e.get("type") == "error"]
            self.assertFalse(errors, errors)
            done = next((e for e in events if e.get("type") == "done"), None)
            self.assertIsNotNone(done, [e.get("type") for e in events])
            self.assertFalse(done.get("error"), done)
            tokens = [e.get("text", "") for e in events if e.get("type") == "token"]
            assistant = "".join(tokens) or (done.get("assistant_text") or "")
            self.assertTrue(len(assistant.strip()) > 2, assistant)


if __name__ == "__main__":
    unittest.main()
