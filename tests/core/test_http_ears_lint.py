"""HTTP EARS lint routes for workspace/session todos."""

from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from bright_vision_core.http_api import app
from cecli.utils import GitTemporaryDirectory, make_repo


class TestHttpEarsLint(unittest.TestCase):
    def test_workspace_lint_requirements(self):
        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            client = TestClient(app)
            created = client.post(
                f"/workspaces/todos?workspace={temp_dir}",
                json={"title": "EARS task", "template": "spec-driven"},
            )
            self.assertEqual(created.status_code, 200, created.text)
            todo_id = created.json()["id"]

            good = client.post(
                f"/workspaces/todos/{todo_id}/lint-requirements?workspace={temp_dir}",
                json={},
            )
            self.assertEqual(good.status_code, 200, good.text)
            body = good.json()
            self.assertTrue(body["ok"], body)

            bad = client.post(
                f"/workspaces/todos/{todo_id}/lint-requirements?workspace={temp_dir}",
                json={
                    "requirements": "### REQ-001\n**WHEN** x\n**THE** system shows y.\n"
                },
            )
            self.assertEqual(bad.status_code, 200, bad.text)
            body = bad.json()
            self.assertFalse(body["ok"])
            self.assertTrue(any(i["code"] == "EARS_NO_SHALL" for i in body["issues"]))

    def test_session_lint_requirements(self):
        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            client = TestClient(app)
            sess = client.post(
                "/sessions",
                json={"workspace": temp_dir, "model": "gpt-4o", "auto_yes": True},
            )
            self.assertEqual(sess.status_code, 200, sess.text)
            session_id = sess.json()["session_id"]
            created = client.post(
                f"/sessions/{session_id}/todos",
                json={"title": "Lint me", "template": "spec-driven"},
            )
            todo_id = created.json()["id"]

            res = client.post(
                f"/sessions/{session_id}/todos/{todo_id}/lint-requirements",
                json={},
            )
            self.assertEqual(res.status_code, 200, res.text)
            self.assertTrue(res.json()["ok"])


if __name__ == "__main__":
    unittest.main()
