"""HTTP routes for project steering files."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient
except ImportError:
    TestClient = None


@unittest.skipIf(TestClient is None, "fastapi not installed")
class TestHttpSteeringFiles(unittest.TestCase):
    def test_steering_scan_and_scaffold(self):
        from bright_vision_core.http_api import app

        with tempfile.TemporaryDirectory() as tmp:
            ws = Path(tmp)
            (ws / ".git").mkdir()
            client = TestClient(app)
            qs = f"workspace={ws}"

            scan = client.get(f"/workspaces/steering-files?{qs}")
            self.assertEqual(scan.status_code, 200, scan.text)
            body = scan.json()
            self.assertFalse(body["has_content"])
            self.assertIsNone(body["main"])

            scaffold = client.post(f"/workspaces/steering-files/scaffold?{qs}")
            self.assertEqual(scaffold.status_code, 200, scaffold.text)
            created = scaffold.json()
            self.assertEqual(created["created"], [".cecli/STEERING.md"])
            self.assertTrue(created["has_content"])
            self.assertTrue((ws / ".cecli" / "STEERING.md").is_file())


if __name__ == "__main__":
    unittest.main()
