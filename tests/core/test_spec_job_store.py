"""Spec job store unit tests (no HTTP app import)."""

from __future__ import annotations

import time
import unittest
from unittest.mock import MagicMock, patch

from bright_vision_core.session import Session
from bright_vision_core.todo_spec_jobs import SpecGenerationJob, SpecJobStore


class TestSpecJobStore(unittest.TestCase):
    def test_stale_running_job_not_reconciled_when_live_session(self):
        store = SpecJobStore()
        job = SpecGenerationJob(
            job_id="live-job",
            workspace="/tmp",
            todo_id="t1",
            status="running",
        )
        job.updated_at = time.time() - 2000.0
        with patch("bright_vision_core.todo_spec_jobs.spec_gen_timeout_s", return_value=60.0):
            with patch.object(store, "_jobs", {"live-job": job}):
                with patch.object(store, "_live_sessions", {"live-job": MagicMock()}):
                    got = store.get("live-job")
        self.assertIsNotNone(got)
        self.assertEqual(got.status, "running")
        self.assertIsNone(got.error)

    def test_background_job_wall_timeout_marks_error(self):
        store = SpecJobStore()

        def slow_layers(*_args, **_kwargs):
            time.sleep(2)
            return {
                "requirements": "",
                "design": "",
                "tasks_md": "",
                "raw": "",
                "item": None,
                "ears_blocked": False,
                "ears_issues": [],
            }

        mock_session = MagicMock()
        mock_session.generate_todo_layers.side_effect = slow_layers

        with patch.object(Session, "create", return_value=mock_session):
            job = store.start(
                "/tmp/workspace",
                "todo-id",
                "ping",
                wall_timeout_s=1.0,
            )
            finished = store.wait(job.job_id, timeout_s=5.0)

        self.assertEqual(finished.status, "error", finished.error)
        self.assertIn("timed out", (finished.error or "").lower())


if __name__ == "__main__":
    unittest.main()
