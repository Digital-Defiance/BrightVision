"""Real HTTP: Cecli agent todo.txt → workspace Tasks (no mocks)."""

from __future__ import annotations

import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient
except ImportError:
    TestClient = None

from cecli.utils import GitTemporaryDirectory, make_repo


@unittest.skipIf(TestClient is None, "fastapi not installed")
class TestHttpAgentTodoImport(unittest.TestCase):
    def test_import_agent_plan_endpoint(self):
        from bright_vision_core.http_api import app

        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            client = TestClient(app)

            empty = client.post(f"/workspaces/todos/import-agent-plan?workspace={temp_dir}")
            self.assertEqual(empty.status_code, 404)

            agents = Path(temp_dir) / ".cecli" / "agents" / "2026-05-27" / "abc"
            agents.mkdir(parents=True)
            (agents / "todo.txt").write_text(
                "Remaining:\n→ Draft roadmap\n○ Write tests\n",
                encoding="utf-8",
            )

            imported = client.post(f"/workspaces/todos/import-agent-plan?workspace={temp_dir}")
            self.assertEqual(imported.status_code, 200, imported.text)
            body = imported.json()
            self.assertEqual(len(body["todos"]), 1)
            self.assertEqual(body["todos"][0]["title"], "Draft roadmap")

            todos_json = Path(temp_dir) / ".cecli" / "todos.json"
            self.assertTrue(todos_json.is_file())

    def test_import_recovers_char_split_agent_todo_txt(self):
        from bright_vision_core.http_api import app

        json_text = (
            '[{"task": "Explore the codebase", "done": false, "current": true},'
            '{"task": "Draft roadmap items", "done": false}]'
        )
        corrupted_lines = ["Remaining:"] + [f"○ {ch}" for ch in json_text] + [""]

        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            agents = Path(temp_dir) / ".cecli" / "agents" / "2026-05-27" / "char-split"
            agents.mkdir(parents=True)
            (agents / "todo.txt").write_text("\n".join(corrupted_lines), encoding="utf-8")

            client = TestClient(app)
            imported = client.post(
                f"/workspaces/todos/import-agent-plan?workspace={temp_dir}"
            )
            self.assertEqual(imported.status_code, 200, imported.text)
            body = imported.json()
            self.assertEqual(len(body["todos"]), 1)
            checklist = body["todos"][0].get("checklist") or []
            self.assertEqual(len(checklist), 2)
            texts = [c["text"] for c in checklist]
            self.assertTrue(any("Explore the codebase" in t for t in texts))
            self.assertTrue(any("Draft roadmap items" in t for t in texts))
            title = body["todos"][0].get("title") or ""
            self.assertNotIn(title, ("[", "{", '"'))
            self.assertIn("Explore the codebase", title)


if __name__ == "__main__":
    unittest.main()
