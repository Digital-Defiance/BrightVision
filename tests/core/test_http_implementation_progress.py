"""HTTP routes for implementation progress and pubspec repair."""

from __future__ import annotations

import unittest

try:
    from fastapi.testclient import TestClient
except ImportError:
    TestClient = None

from cecli.utils import GitTemporaryDirectory, make_repo


@unittest.skipIf(TestClient is None, "fastapi not installed")
class TestHttpImplementationProgress(unittest.TestCase):
    def test_implementation_progress_and_materialize(self):
        from bright_vision_core.http_api import app
        from bright_vision_core.workspace_todos import WorkspaceTodos
        from cecli.spec.todos import TodoItem, _now_iso

        tasks_md = "- [ ] 1.1 Wire API (depends: none)\n- [ ] 1.2 Add tests (depends: 1.1)\n"

        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            api = WorkspaceTodos(temp_dir)
            store = api.load()
            item = TodoItem(
                id="prog1",
                title="Feature",
                tasks_md=tasks_md,
                checklist=[],
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
            store.todos.append(item)
            api.save(store)

            client = TestClient(app)
            mat = client.post(
                f"/workspaces/todos/prog1/materialize-checklist?workspace={temp_dir}"
            )
            self.assertEqual(mat.status_code, 200, mat.text)
            self.assertEqual(len(mat.json()["checklist"]), 2)

            prog = client.get(
                f"/workspaces/todos/prog1/implementation-progress?workspace={temp_dir}"
            )
            self.assertEqual(prog.status_code, 200, prog.text)
            body = prog.json()
            self.assertEqual(body["next_open"]["step_id"], "1.1")

    def test_repair_pubspec_dry_run(self):
        from bright_vision_core.http_api import app
        from pathlib import Path

        with GitTemporaryDirectory() as temp_dir:
            make_repo(temp_dir)
            Path(temp_dir, "pubspec.yaml").write_text(
                "name: demo\ndependencies:\n  flutter:\n    sdk: flutter\n",
                encoding="utf-8",
            )
            lib = Path(temp_dir) / "lib"
            lib.mkdir()
            (lib / "main.dart").write_text("import 'package:http/http.dart';\n", encoding="utf-8")

            client = TestClient(app)
            res = client.post(f"/workspaces/repair-pubspec?workspace={temp_dir}&apply=false")
            self.assertEqual(res.status_code, 200, res.text)
            self.assertIn("http", res.json()["missing"])


if __name__ == "__main__":
    unittest.main()
