"""Session mode + EARS lint on todo save."""

from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from bright_vision_core.http_api import app
from cecli.utils import GitTemporaryDirectory, make_repo


class TestSessionModeEarsSave(unittest.TestCase):
    def test_create_spec_session_mode(self):
        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            client = TestClient(app)
            res = client.post(
                "/sessions",
                json={"workspace": temp_dir, "model": "gpt-4o", "session_mode": "spec"},
            )
            self.assertEqual(res.status_code, 200, res.text)

    def test_patch_requirements_returns_ears_lint(self):
        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            client = TestClient(app)
            created = client.post(
                f"/workspaces/todos?workspace={temp_dir}",
                json={"title": "Lint on save", "template": "spec-driven"},
            )
            todo_id = created.json()["id"]
            bad = client.patch(
                f"/workspaces/todos/{todo_id}?workspace={temp_dir}",
                json={
                    "requirements": "### REQ-001\n**WHEN** x\n**THE** system shows y.\n"
                },
            )
            self.assertEqual(bad.status_code, 200, bad.text)
            body = bad.json()
            self.assertFalse(body["ears_requirements_ok"])
            self.assertGreater(body["ears_error_count"], 0)


if __name__ == "__main__":
    unittest.main()
