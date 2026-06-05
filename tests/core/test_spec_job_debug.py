"""Spec job debug export."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from bright_vision_core.http_api import app
from bright_vision_core.spec_job_debug import build_spec_job_debug_export
from bright_vision_core.todo_spec_jobs import SpecGenerationJob, spec_job_store
from cecli.utils import GitTemporaryDirectory, make_repo
from spec_layer_assertions import SAMPLE_GENERATED_MARKDOWN


class TestSpecJobDebug(unittest.TestCase):
    def test_build_spec_job_debug_export_shape(self):
        job = SpecGenerationJob(
            job_id="abc123",
            workspace="/tmp/ws",
            todo_id="todo-1",
            prompt="Build modules",
            mode="generate",
            section="requirements",
            model="gpt-4o",
            status="running",
            recent_io_events=[{"type": "progress", "label": "LLM", "message": "Waiting…"}],
        )
        payload = build_spec_job_debug_export(job)
        self.assertEqual(payload["format"], "brightvision-spec-job-debug-v1")
        self.assertEqual(payload["job_id"], "abc123")
        self.assertEqual(payload["job"]["status"], "running")
        self.assertEqual(payload["job"]["section"], "requirements")
        self.assertEqual(len(payload["recent_io_events"]), 1)

    def test_http_spec_job_debug_endpoint(self):
        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            client = TestClient(app)
            sess = client.post(
                "/sessions",
                json={"workspace": temp_dir, "model": "gpt-4o", "auto_yes": True},
            )
            session_id = sess.json()["session_id"]
            created = client.post(
                f"/workspaces/todos?workspace={temp_dir}",
                json={"title": "Debug me", "template": "spec-driven"},
            )
            todo_id = created.json()["id"]

            mock_session = MagicMock()
            mock_io = MagicMock()
            mock_io.debug_event_ring = [
                {"type": "progress", "label": "LLM", "message": "Waiting for model response…"},
                {"type": "token", "text": "partial"},
            ]
            mock_session.io = mock_io
            mock_session.coder.main_model.name = "gpt-4o"
            mock_session.coder.get_inchat_relative_files.return_value = []
            mock_session.coder.done_messages = []
            mock_session.coder.cur_messages = []
            mock_session.generate_todo_layers.return_value = {
                "requirements": "REQ",
                "design": "",
                "tasks_md": "",
                "raw": SAMPLE_GENERATED_MARKDOWN,
                "item": None,
                "ears_blocked": False,
                "ears_issues": [],
            }

            with patch.object(
                __import__("bright_vision_core.todo_spec_jobs", fromlist=["Session"]).Session,
                "create",
                return_value=mock_session,
            ):
                job = spec_job_store.start(
                    temp_dir,
                    todo_id,
                    "Design modules",
                    mode="generate",
                    section="design",
                    apply=True,
                    enforce_ears=True,
                )
                finished = spec_job_store.wait(job.job_id, timeout_s=5.0)

            self.assertEqual(finished.status, "completed")
            res = client.get(f"/workspaces/todos/generate-spec/{job.job_id}/debug")
            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertEqual(body["format"], "brightvision-spec-job-debug-v1")
            self.assertEqual(body["job_id"], job.job_id)
            self.assertIn("recent_io_events", body)
            self.assertGreaterEqual(len(body["recent_io_events"]), 1)

            res2 = client.get(
                f"/sessions/{session_id}/todos/generate-spec/{job.job_id}/debug"
            )
            self.assertEqual(res2.status_code, 200)


if __name__ == "__main__":
    unittest.main()
