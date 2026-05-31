"""HTTP generate-spec with mocked LLM output (no Ollama)."""

from __future__ import annotations

import time
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from bright_vision_core.http_api import app
from bright_vision_core.session import Session
from cecli.utils import GitTemporaryDirectory, make_repo
from spec_layer_assertions import SAMPLE_GENERATED_MARKDOWN, assess_generated_spec_layers


class TestHttpGenerateSpecMock(unittest.TestCase):
    def test_generate_spec_applies_sane_layers(self):
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
                f"/workspaces/todos?workspace={temp_dir}",
                json={"title": "Generate me", "template": "spec-driven"},
            )
            todo_id = created.json()["id"]

            with patch.object(Session, "run_one_shot", return_value=SAMPLE_GENERATED_MARKDOWN):
                res = client.post(
                    f"/workspaces/todos/{todo_id}/generate-spec"
                    f"?workspace={temp_dir}&session_id={session_id}",
                    json={
                        "prompt": "Design modules",
                        "mode": "generate",
                        "section": "design",
                        "apply": True,
                        "background": False,
                        "enforce_ears": True,
                    },
                )
            self.assertEqual(res.status_code, 200, res.text)
            item = (res.json().get("item") or {})
            self.assertIn("REQ-001", item.get("requirements", ""))
            self.assertIn("Overview", item.get("design", ""))

            with patch.object(Session, "run_one_shot", return_value=SAMPLE_GENERATED_MARKDOWN):
                res = client.post(
                    f"/workspaces/todos/{todo_id}/generate-spec"
                    f"?workspace={temp_dir}&session_id={session_id}",
                    json={
                        "prompt": "Ping counter feature",
                        "mode": "generate",
                        "apply": True,
                        "background": False,
                        "enforce_ears": True,
                    },
                )
            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertFalse(body.get("ears_blocked"), body)
            ok, issues = assess_generated_spec_layers(
                body.get("requirements", ""),
                body.get("design", ""),
                body.get("tasks_md", ""),
            )
            self.assertTrue(ok, issues)
            item = body.get("item") or {}
            self.assertIn("REQ-001", item.get("requirements", ""))

    def test_background_spec_job_uses_ephemeral_chat_history(self):
        from unittest.mock import MagicMock

        from bright_vision_core.todo_spec_jobs import spec_job_store

        mock_session = MagicMock()
        mock_session.generate_todo_layers.return_value = {
            "requirements": "",
            "design": "",
            "tasks_md": "",
            "raw": SAMPLE_GENERATED_MARKDOWN,
            "item": None,
            "ears_blocked": False,
            "ears_issues": [],
        }

        with patch.object(Session, "create", return_value=mock_session) as create:
            job = spec_job_store.start(
                "/tmp/workspace",
                "todo-id",
                "ping",
                mode="generate",
                apply=True,
                enforce_ears=True,
            )
            finished = spec_job_store.wait(job.job_id, timeout_s=5.0)

        self.assertEqual(finished.status, "completed", finished.error)
        create.assert_called_once()
        self.assertIs(create.call_args.kwargs.get("chat_history_file"), False)

    def test_background_spec_job_wall_timeout_marks_error(self):
        from bright_vision_core.todo_spec_jobs import spec_job_store

        def slow_layers(*_args, **_kwargs):
            time.sleep(3)
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
            with patch(
                "bright_vision_core.todo_spec_jobs.spec_gen_timeout_s",
                return_value=1.0,
            ):
                job = spec_job_store.start(
                    "/tmp/workspace",
                    "todo-id",
                    "ping",
                    mode="generate",
                    apply=True,
                    enforce_ears=True,
                )
                finished = spec_job_store.wait(job.job_id, timeout_s=5.0)

        self.assertEqual(finished.status, "error", finished.error)
        self.assertIn("timed out", (finished.error or "").lower())


if __name__ == "__main__":
    unittest.main()
