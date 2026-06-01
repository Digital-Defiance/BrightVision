"""
Agent dogfood: superproject + submodule layout at Session/git_workspace layer (no GUI).

Covers SUBMODULE_VERIFICATION concerns A/D at the core — run via yarn dogfood:agent.
Skipped unless BrightVision superproject layout exists.
"""

from __future__ import annotations

import os
import unittest
from pathlib import Path

CORE_ROOT = Path(__file__).resolve().parents[2]
SUPERPROJECT = Path(os.environ.get("BRIGHT_VISION_SUPERPROJECT", CORE_ROOT))
CECLI_SUBMODULE = "cecli"
VISION_REL = "bright_vision_core/session.py"
CECLI_MAIN = f"{CECLI_SUBMODULE}/cecli/main.py"
PARENT_UI = "src/App.tsx"


def _have_superproject_layout() -> bool:
    return (
        (SUPERPROJECT / ".git").exists()
        and (SUPERPROJECT / VISION_REL).is_file()
        and (SUPERPROJECT / CECLI_SUBMODULE).is_dir()
    )


@unittest.skipUnless(_have_superproject_layout(), "requires BrightVision superproject checkout")
class TestSuperprojectDogfood(unittest.TestCase):
    def test_repo_set_paths_parent_and_submodule(self):
        from bright_vision_core.event_io import EventIO
        from bright_vision_core.git_workspace import RepoSet, create_git_workspace, discover_submodule_paths

        io = EventIO(yes=True, echo_to_console=False)
        paths = discover_submodule_paths(str(SUPERPROJECT))
        self.assertIn(CECLI_SUBMODULE, paths)

        ws = create_git_workspace(io, [], str(SUPERPROJECT))
        self.assertIsInstance(ws, RepoSet)
        self.assertTrue(ws.path_in_repo(VISION_REL))
        sub = ws.repo_for_rel_path(CECLI_MAIN)
        self.assertTrue(str(sub.root).endswith(CECLI_SUBMODULE))

    def test_session_create_uses_superproject_root_and_parent_file(self):
        from bright_vision_core.session import Session

        session = Session.create(
            str(SUPERPROJECT),
            files=[str(SUPERPROJECT / VISION_REL)],
            yes=True,
            dry_run=True,
        )
        self.assertEqual(Path(session.coder.root).resolve(), SUPERPROJECT.resolve())
        inchat = {p.replace("\\", "/") for p in session.coder.get_inchat_relative_files()}
        self.assertIn(VISION_REL.replace("\\", "/"), inchat)

    def test_mixed_tree_paths_resolve_without_cross_repo_writes(self):
        from bright_vision_core.event_io import EventIO
        from bright_vision_core.git_workspace import RepoSet, create_git_workspace

        io = EventIO(yes=True, echo_to_console=False)
        parent_ui = SUPERPROJECT / PARENT_UI
        paths = [str(SUPERPROJECT / VISION_REL)]
        if parent_ui.is_file():
            paths.append(str(parent_ui))
        cecli_main = SUPERPROJECT / CECLI_MAIN
        if cecli_main.is_file():
            paths.append(str(cecli_main))

        ws = create_git_workspace(io, paths, str(SUPERPROJECT))
        self.assertIsInstance(ws, RepoSet)
        for rel in (VISION_REL, PARENT_UI, CECLI_MAIN):
            if (SUPERPROJECT / rel).is_file():
                self.assertTrue(ws.path_in_repo(rel), rel)


if __name__ == "__main__":
    unittest.main()
