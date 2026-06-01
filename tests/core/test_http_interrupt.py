"""POST /sessions/{id}/interrupt — UI Stop."""

from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from bright_vision_core.http_api import app
from cecli.utils import GitTemporaryDirectory, make_repo


class TestHttpInterrupt(unittest.TestCase):
    def test_interrupt_unknown_session_404(self):
        client = TestClient(app)
        res = client.post("/sessions/no-such-session/interrupt")
        self.assertEqual(res.status_code, 404)

    def test_interrupt_ok(self):
        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            client = TestClient(app)
            sess = client.post(
                "/sessions",
                json={"workspace": temp_dir, "model": "gpt-4o", "auto_yes": True},
            )
            session_id = sess.json()["session_id"]
            res = client.post(f"/sessions/{session_id}/interrupt")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json(), {"ok": True})


if __name__ == "__main__":
    unittest.main()
