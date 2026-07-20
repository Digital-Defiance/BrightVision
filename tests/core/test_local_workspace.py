"""Multi-repo workspace (.cecli.workspaces.yml with path: projects)."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml


class TestLocalWorkspaceConfig(unittest.TestCase):
    def test_validate_path_or_repo_exclusive(self):
        from cecli.helpers.monorepo.config import validate_config

        validate_config(
            {
                "name": "ws",
                "projects": [{"name": "app", "path": "/tmp/app", "primary": True}],
            }
        )
        with self.assertRaises(ValueError):
            validate_config(
                {
                    "name": "ws",
                    "projects": [{"name": "bad", "path": "/a", "repo": "https://example.com/x.git"}],
                }
            )

    def test_union_tracked_files_two_repos(self):
        from cecli.helpers.monorepo.config import load_workspace_config_file
        from cecli.helpers.monorepo.local_workspace import union_tracked_files

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = root / "a"
            b = root / "b"
            for repo in (a, b):
                repo.mkdir()
                subprocess.run(
                    ["git", "-c", "core.hooksPath=/dev/null", "init"],
                    cwd=repo,
                    check=True,
                    capture_output=True,
                )
                (repo / "README.md").write_text(f"# {repo.name}\n", encoding="utf-8")
                subprocess.run(
                    ["git", "-c", "core.hooksPath=/dev/null", "add", "README.md"],
                    cwd=repo,
                    check=True,
                    capture_output=True,
                )
                subprocess.run(
                    [
                        "git",
                        "-c",
                        "core.hooksPath=/dev/null",
                        "-c",
                        "user.email=t@t",
                        "-c",
                        "user.name=t",
                        "commit",
                        "-m",
                        "init",
                        "--no-gpg-sign",
                    ],
                    cwd=repo,
                    check=True,
                    capture_output=True,
                )
            ws_path = root / ".cecli.workspaces.yml"
            ws_path.write_text(
                yaml.dump(
                    {
                        "name": "pair",
                        "projects": [
                            {"name": "a", "path": str(a), "primary": True},
                            {"name": "b", "path": str(b)},
                        ],
                    }
                ),
                encoding="utf-8",
            )
            cfg = load_workspace_config_file(ws_path)
            files = union_tracked_files(root, cfg, layout="local")
            self.assertIn("a/README.md", files)
            self.assertIn("b/README.md", files)

    def test_create_git_workspace_prefers_yaml_over_submodules(self):
        from cecli.helpers.monorepo.local_workspace import find_workspace_config_file
        from bright_vision_core.git_workspace import create_git_workspace

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(
                ["git", "-c", "core.hooksPath=/dev/null", "init"],
                cwd=root,
                check=True,
                capture_output=True,
            )
            (root / ".cecli.workspaces.yml").write_text(
                yaml.dump(
                    {
                        "name": "solo",
                        "projects": [{"name": "solo", "path": str(root), "primary": True}],
                    }
                ),
                encoding="utf-8",
            )
            self.assertIsNotNone(find_workspace_config_file(root))

            class _Io:
                def tool_error(self, *a, **k):
                    pass

            repo = create_git_workspace(_Io(), [str(root)], str(root))
            from cecli.repo import GitRepo

            self.assertIsInstance(repo, GitRepo)
            self.assertTrue(getattr(repo, "is_workspace", False))
            self.assertEqual(getattr(repo, "workspace_layout", None), "local")

    def test_describe_cecli_workspace_absent(self):
        from bright_vision_core.workspace_config import describe_cecli_workspace

        with tempfile.TemporaryDirectory() as tmp:
            info = describe_cecli_workspace(Path(tmp))
            self.assertFalse(info["present"])
            self.assertEqual(info["project_count"], 0)

    def test_find_workspace_config_file_walks_up(self):
        from cecli.helpers.monorepo.local_workspace import find_workspace_config_file

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sub = root / "nested" / "repo"
            sub.mkdir(parents=True)
            (root / ".cecli.workspaces.yml").write_text(
                "name: ws\nprojects: []\n",
                encoding="utf-8",
            )
            found = find_workspace_config_file(sub)
            self.assertIsNotNone(found)
            self.assertEqual(found.resolve(), (root / ".cecli.workspaces.yml").resolve())

    def test_describe_cecli_workspace_with_projects(self):
        from bright_vision_core.workspace_config import describe_cecli_workspace

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".cecli.workspaces.yml").write_text(
                yaml.dump(
                    {
                        "name": "pair",
                        "projects": [
                            {"name": "a", "path": "/tmp/a", "primary": True},
                            {"name": "b", "path": "/tmp/b"},
                        ],
                    }
                ),
                encoding="utf-8",
            )
            info = describe_cecli_workspace(root)
            self.assertTrue(info["present"])
            self.assertEqual(info["project_count"], 2)
            self.assertEqual(info["name"], "pair")

    def test_http_cecli_workspace_endpoint(self):
        from fastapi.testclient import TestClient

        from bright_vision_core.http_api import app

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".cecli.workspaces.yml").write_text(
                "name: solo\nprojects:\n  - name: solo\n    path: /x\n    primary: true\n",
                encoding="utf-8",
            )
            client = TestClient(app)
            res = client.get(f"/workspaces/cecli-workspace?workspace={root}")
            self.assertEqual(res.status_code, 200)
            body = res.json()
            self.assertTrue(body["present"])
            self.assertEqual(body["project_count"], 1)

    def test_ensure_workspaces_file_no_overwrite(self):
        from bright_vision_core.workspace_config import ensure_workspaces_file, workspaces_file_in_project

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            existing = root / ".cecli.workspaces.yml"
            existing.write_text("name: kept\nprojects: []\n", encoding="utf-8")
            ensure_workspaces_file(root, {"name": "new", "projects": []})
            self.assertIn("kept", existing.read_text(encoding="utf-8"))
            self.assertIsNotNone(workspaces_file_in_project(root))


if __name__ == "__main__":
    unittest.main()
