"""Verify cecli submodule ships local-model tool JSON fixes (superproject gate)."""

from __future__ import annotations

import os
import unittest
from pathlib import Path

CORE_ROOT = Path(__file__).resolve().parents[2]
SUPERPROJECT = Path(os.environ.get("BRIGHT_VISION_SUPERPROJECT", CORE_ROOT))
CECLI_HELPERS = SUPERPROJECT / "cecli/cecli/tools/utils/helpers.py"


def _have_cecli_helpers() -> bool:
    return (SUPERPROJECT / "cecli").is_dir() and CECLI_HELPERS.is_file()


@unittest.skipUnless(_have_cecli_helpers(), "requires cecli submodule")
class TestCecliToolJsonSubmodule(unittest.TestCase):
    def test_parse_tool_arguments_merges_glued_empty_object_fragments(self):
        from cecli.tools.utils.helpers import parse_tool_arguments

        raw = '{"limit": 15}{}{"path": "."}'
        self.assertEqual(parse_tool_arguments(raw), {"limit": 15, "path": "."})

    def test_merge_glued_json_objects_rejects_array_chunks(self):
        from cecli.tools.utils.helpers import merge_glued_json_objects

        self.assertIsNone(merge_glued_json_objects(['["a"]', '{"b": 1}']))


if __name__ == "__main__":
    unittest.main()
