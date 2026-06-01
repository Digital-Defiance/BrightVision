"""
Integration checks for BrightVision superproject + cecli submodule.

Skipped unless the parent repo layout exists (dev checkout).
"""

from __future__ import annotations

import os
import unittest
from pathlib import Path

CORE_ROOT = Path(__file__).resolve().parents[2]
SUPERPROJECT = Path(os.environ.get("BRIGHT_VISION_SUPERPROJECT", CORE_ROOT))
CECLI_SUBMODULE = "cecli"
VISION_REL = "bright_vision_core/session.py"


def _have_superproject_layout() -> bool:
    return (
        (SUPERPROJECT / ".git").exists()
        and (SUPERPROJECT / VISION_REL).is_file()
        and (SUPERPROJECT / CECLI_SUBMODULE).is_dir()
    )


@unittest.skipUnless(_have_superproject_layout(), "requires BrightVision superproject checkout")
class TestBrightVisionSubmoduleLayout(unittest.TestCase):
    def test_repo_set_and_submodule_paths(self):
        from bright_vision_core.event_io import EventIO
        from bright_vision_core.git_workspace import RepoSet, create_git_workspace, discover_submodule_paths

        io = EventIO(yes=True, echo_to_console=False)
        paths = discover_submodule_paths(str(SUPERPROJECT))
        self.assertIn(CECLI_SUBMODULE, paths)

        ws = create_git_workspace(io, [], str(SUPERPROJECT))
        self.assertIsInstance(ws, RepoSet)

        self.assertTrue(ws.path_in_repo(VISION_REL))
        sub = ws.repo_for_rel_path(f"{CECLI_SUBMODULE}/cecli/main.py")
        self.assertTrue(str(sub.root).endswith(CECLI_SUBMODULE))

    def test_session_create_adds_vision_layer_file(self):
        from bright_vision_core.session import Session

        session = Session.create(
            str(SUPERPROJECT),
            files=[str(SUPERPROJECT / VISION_REL)],
            yes=True,
            dry_run=True,
        )
        self.assertEqual(Path(session.coder.root).resolve(), SUPERPROJECT.resolve())
        inchat = session.coder.get_inchat_relative_files()
        self.assertIn(VISION_REL.replace("\\", "/"), [p.replace("\\", "/") for p in inchat])


if __name__ == "__main__":
    unittest.main()
