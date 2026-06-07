"""Tests for implement workspace snapshot injection."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from bright_vision_core.implement_workspace import (
    build_implement_workspace_block,
    deliverable_paths_exist,
    paths_from_checklist_text,
)
from bright_vision_core.workspace_todos import ChecklistItem


class TestImplementWorkspace(unittest.TestCase):
    def test_paths_from_checklist_text(self):
        text = "1.2 Implement NetworkInterceptor in lib/core/network/"
        assert paths_from_checklist_text(text) == ["lib/core/network"]

    def test_deliverable_paths_exist(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            net = root / "lib" / "core" / "network"
            net.mkdir(parents=True)
            (net / "interceptor.dart").write_text("// x", encoding="utf-8")
            self.assertTrue(deliverable_paths_exist(root, ["lib/core/network"]))

    def test_snapshot_lists_lib_and_test(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "pubspec.yaml").write_text("name: x\n", encoding="utf-8")
            lib = root / "lib" / "core" / "network"
            lib.mkdir(parents=True)
            (lib / "a.dart").write_text("", encoding="utf-8")
            test = root / "test" / "core" / "network"
            test.mkdir(parents=True)
            (test / "a_test.dart").write_text("", encoding="utf-8")
            checklist = [
                ChecklistItem(id="c1", text="1.3 Write unit tests for NetworkInterceptor", done=False),
            ]
            block = build_implement_workspace_block(root, checklist, resume=True)
            self.assertIn("Workspace snapshot", block)
            self.assertIn("lib/core/network/a.dart", block)
            self.assertIn("test/core/network/a_test.dart", block)
            self.assertIn("Do not batch UpdateTodoList", block)
            self.assertIn("flutter test", block)


if __name__ == "__main__":
    unittest.main()
