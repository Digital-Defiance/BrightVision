"""HTTP API: Cecli session persistence and encryption flags on create."""

from __future__ import annotations

import base64
import os
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient

    from bright_vision_core.http_api import _sessions, app
    from bright_vision_core.http_auth import configure_auth, reset_auth_for_tests
except ImportError:
    TestClient = None
    app = None
    configure_auth = None
    reset_auth_for_tests = None

from cecli import session_crypto
from cecli.sessions import SessionManager
from cecli.utils import GitTemporaryDirectory


@unittest.skipIf(TestClient is None, "fastapi not installed")
class TestHttpSessionPersistence(unittest.TestCase):
    def setUp(self):
        _sessions.clear()
        reset_auth_for_tests()
        configure_auth("127.0.0.1")
        self._prev_key = os.environ.pop("CECLI_SESSION_KEY", None)

    def tearDown(self):
        reset_auth_for_tests()
        if self._prev_key is not None:
            os.environ["CECLI_SESSION_KEY"] = self._prev_key
        else:
            os.environ.pop("CECLI_SESSION_KEY", None)

    def _set_session_key(self) -> bytes:
        key = os.urandom(32)
        os.environ["CECLI_SESSION_KEY"] = base64.urlsafe_b64encode(key).decode().rstrip("=")
        return key

    def test_create_session_passes_persistence_to_coder(self):
        self._set_session_key()
        with GitTemporaryDirectory() as root:
            client = TestClient(app)
            res = client.post(
                "/sessions",
                json={
                    "workspace": root,
                    "model": "gpt-4o",
                    "session_encrypt": True,
                    "auto_save": True,
                    "auto_load": False,
                    "auto_save_session_name": "bv-http",
                    "chat_history_file": True,
                },
            )
            if res.status_code == 400:
                self.skipTest(f"Could not create session (model/env): {res.text}")
            self.assertEqual(res.status_code, 200, res.text)
            session_id = res.json()["session_id"]
            session = _sessions[session_id]
            self.assertTrue(session.coder.args.session_encrypt)
            self.assertTrue(session.coder.args.auto_save)
            self.assertEqual(session.coder.args.auto_save_session_name, "bv-http")
            self.assertIsNotNone(getattr(session.io, "chat_history_file", None))
            chat_hist = Path(root) / ".cecli" / "chat.history"
            self.assertTrue(
                str(chat_hist) == str(session.io.chat_history_file)
                or chat_hist.name in str(session.io.chat_history_file)
            )

    def test_encrypted_save_via_session_manager(self):
        self._set_session_key()
        with GitTemporaryDirectory() as root:
            client = TestClient(app)
            res = client.post(
                "/sessions",
                json={
                    "workspace": root,
                    "model": "gpt-4o",
                    "session_encrypt": True,
                },
            )
            if res.status_code == 400:
                self.skipTest(f"Could not create session (model/env): {res.text}")
            session_id = res.json()["session_id"]
            session = _sessions[session_id]
            manager = SessionManager(session.coder, session.io)
            self.assertTrue(manager.save_session("encrypted-save", output=False))
            path = Path(root) / ".cecli" / "sessions" / "encrypted-save.json"
            self.assertTrue(path.is_file())
            raw = path.read_bytes()
            self.assertTrue(session_crypto.is_encrypted_payload(raw))
            data = session_crypto.decrypt_session_bytes(raw, session_crypto.resolve_key())
            self.assertEqual(data.get("session_name"), "encrypted-save")
            self.assertIn("version", data)

    def test_plaintext_save_when_encryption_off(self):
        with GitTemporaryDirectory() as root:
            client = TestClient(app)
            res = client.post(
                "/sessions",
                json={"workspace": root, "model": "gpt-4o", "session_encrypt": False},
            )
            if res.status_code == 400:
                self.skipTest(f"Could not create session (model/env): {res.text}")
            session = _sessions[res.json()["session_id"]]
            manager = SessionManager(session.coder, session.io)
            self.assertTrue(manager.save_session("plain", output=False))
            raw = (Path(root) / ".cecli" / "sessions" / "plain.json").read_bytes()
            self.assertFalse(session_crypto.is_encrypted_payload(raw))
            self.assertTrue(raw.startswith(b"{"))


if __name__ == "__main__":
    unittest.main()
