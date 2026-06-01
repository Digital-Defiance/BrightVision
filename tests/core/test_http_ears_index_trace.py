"""HTTP spec-index and trace-spec routes."""

from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from bright_vision_core.http_api import app
from cecli.utils import GitTemporaryDirectory, make_repo


class TestHttpEarsIndexTrace(unittest.TestCase):
    def test_workspace_spec_index(self):
        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            client = TestClient(app)
            created = client.post(
                f"/workspaces/todos?workspace={temp_dir}",
                json={"title": "Indexed", "template": "spec-driven"},
            )
            todo_id = created.json()["id"]
            res = client.get(f"/workspaces/spec-index?workspace={temp_dir}")
            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertIn(todo_id, body["task_ids"])

    def test_trace_spec_with_draft(self):
        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            client = TestClient(app)
            created = client.post(
                f"/workspaces/todos?workspace={temp_dir}",
                json={"title": "Trace me", "template": "spec-driven"},
            )
            todo_id = created.json()["id"]
            res = client.post(
                f"/workspaces/todos/{todo_id}/trace-spec?workspace={temp_dir}",
                json={
                    "requirements": "### REQ-001\n**WHEN** x\n**THE** system **SHALL** y.\n",
                    "design": "See REQ-001.",
                    "tasks_md": "- [ ] 1. Implement REQ-001 (depends: none)\n",
                },
            )
            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertIn("REQ-001", body["req_ids"])
            self.assertTrue(body["links"][0]["task_steps"])


if __name__ == "__main__":
    unittest.main()
