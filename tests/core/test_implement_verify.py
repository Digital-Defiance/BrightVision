"""Unit tests for bright_vision_core.implement_verify."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bright_vision_core.implement_verify import (
    build_auto_advance_message,
    check_edited_files_for_duplicates,
    deduplicate_output,
    detect_duplicate_output,
    extract_step_text,
    extract_verify_for_step,
    next_step_after,
    parse_open_steps,
    run_verify_command,
)

SAMPLE_TASKS_MD = """\
- [x] 1.1 Create config resolver
    - verify: `python -c "from foo import bar"`
- [x] 1.2 Add persist function
    - verify: `python -c "from foo import persist"`
- [ ] 1.3 Write unit tests
    - verify: `python -m pytest tests/test_foo.py -v`
- [ ] 2.1 Create metadata.json
    - verify: `python -c "import json"`
- [ ] 2.2 Implement resolver
    - verify: `python -c "from bar import resolve"`
- [ ] 3.1 Define protocol
    - verify: `python -c "from baz import Protocol"`
"""


class TestParseOpenSteps(unittest.TestCase):
    def test_finds_unchecked_steps(self):
        steps = parse_open_steps(SAMPLE_TASKS_MD)
        self.assertEqual(steps, ["1.3", "2.1", "2.2", "3.1"])

    def test_empty_input(self):
        self.assertEqual(parse_open_steps(""), [])
        self.assertEqual(parse_open_steps("no checkboxes here"), [])


class TestNextStepAfter(unittest.TestCase):
    def test_next_after_done_step(self):
        self.assertEqual(next_step_after(SAMPLE_TASKS_MD, "1.2"), "1.3")

    def test_next_after_open_step(self):
        self.assertEqual(next_step_after(SAMPLE_TASKS_MD, "1.3"), "2.1")

    def test_next_after_middle(self):
        self.assertEqual(next_step_after(SAMPLE_TASKS_MD, "2.1"), "2.2")

    def test_wraps_when_past_end(self):
        # Past last open step — returns first open step (wrap)
        result = next_step_after(SAMPLE_TASKS_MD, "3.1")
        self.assertEqual(result, "1.3")  # wraps to first open

    def test_all_done(self):
        all_done = "- [x] 1.1 Done\n- [x] 1.2 Done\n"
        self.assertIsNone(next_step_after(all_done, "1.2"))

    def test_item_uses_checklist_when_tasks_md_stale(self):
        from cecli.spec.todos import ChecklistItem, TodoItem, _now_iso

        item = TodoItem(
            id="t1",
            title="T",
            tasks_md="- [ ] 1.3 Write unit tests\n- [ ] 2.1 Next\n",
            checklist=[
                ChecklistItem(id="a", text="1.3 Write unit tests", done=True),
                ChecklistItem(id="b", text="2.1 Next", done=False),
            ],
            created_at=_now_iso(),
            updated_at=_now_iso(),
        )
        self.assertEqual(next_step_after(item.tasks_md, "1.3"), "2.1")
        self.assertEqual(next_step_after(item.tasks_md, "1.3", item=item), "2.1")


class TestExtractVerifyForStep(unittest.TestCase):
    def test_extracts_verify_for_known_step(self):
        v = extract_verify_for_step(SAMPLE_TASKS_MD, "1.3")
        self.assertEqual(v, "python -m pytest tests/test_foo.py -v")

    def test_extracts_verify_for_another_step(self):
        v = extract_verify_for_step(SAMPLE_TASKS_MD, "2.1")
        self.assertEqual(v, 'python -c "import json"')

    def test_returns_none_for_missing_step(self):
        self.assertIsNone(extract_verify_for_step(SAMPLE_TASKS_MD, "9.9"))

    def test_returns_none_for_step_without_verify(self):
        no_verify = "- [ ] 1.1 Do something\n    - some note\n"
        self.assertIsNone(extract_verify_for_step(no_verify, "1.1"))


class TestExtractStepText(unittest.TestCase):
    def test_extracts_step_content(self):
        text = extract_step_text(SAMPLE_TASKS_MD, "1.3")
        self.assertIn("Write unit tests", text)

    def test_empty_for_missing_step(self):
        self.assertEqual(extract_step_text(SAMPLE_TASKS_MD, "9.9"), "")


class TestRunVerifyCommand(unittest.TestCase):
    def test_passing_command(self):
        ok, output = run_verify_command(".", 'python3 -c "print(42)"')
        self.assertTrue(ok)
        self.assertIn("42", output)

    def test_failing_command(self):
        ok, output = run_verify_command(".", "python3 -c \"raise SystemExit(1)\"")
        self.assertFalse(ok)

    def test_timeout(self):
        ok, output = run_verify_command(".", "sleep 10", timeout_s=0.5)
        self.assertFalse(ok)
        self.assertIn("timed out", output)


class TestDuplicateDetection(unittest.TestCase):
    def test_normal_code_not_detected(self):
        # Varied code — first and second halves are genuinely different
        code = (
            "import os\nimport sys\n\n"
            "def connect_db(host, port):\n"
            "    return f'{host}:{port}'\n\n"
            "def query(conn, sql):\n"
            "    return conn.execute(sql)\n\n"
            "class UserRepo:\n"
            "    def __init__(self, db):\n"
            "        self.db = db\n\n"
            "    def find(self, user_id):\n"
            "        return self.db.get(user_id)\n\n"
            "    def save(self, user):\n"
            "        self.db.put(user.id, user)\n\n"
            "def main():\n"
            "    db = connect_db('localhost', 5432)\n"
            "    repo = UserRepo(db)\n"
            "    print(repo.find(1))\n"
        )
        self.assertFalse(detect_duplicate_output(code))

    def test_duplicated_code_detected(self):
        block = (
            '"""Module docstring."""\n\n'
            "import os\nimport json\nfrom pathlib import Path\n\n"
            "ALLOWED = frozenset(['a', 'b', 'c'])\n\n"
            "def resolve():\n    return os.environ.get('X', 'default')\n\n"
            "def persist(data):\n    Path('out.json').write_text(json.dumps(data))\n"
        )
        duplicated = block + "\n" + block
        self.assertTrue(detect_duplicate_output(duplicated))

    def test_short_content_skipped(self):
        short = "x = 1\n" * 5
        self.assertFalse(detect_duplicate_output(short))

    def test_deduplicate_shortens(self):
        block = (
            '"""Module."""\n\nimport os\n\n'
            "def foo():\n    return os.getcwd()\n\n"
            "def bar():\n    return 42\n"
        )
        duplicated = block + "\n" + block
        if detect_duplicate_output(duplicated):
            deduped = deduplicate_output(duplicated)
            self.assertLess(len(deduped), len(duplicated))


class TestCheckEditedFilesForDuplicates(unittest.TestCase):
    def test_detects_duplicate_in_file(self):
        block = (
            '"""Config resolver."""\n\n'
            "import json\nimport os\nfrom pathlib import Path\n\n"
            "BACKENDS = frozenset(['ollama', 'vllm'])\n\n"
            "def resolve():\n    return os.environ.get('BACKEND', 'ollama')\n\n"
            "def persist(cfg):\n    Path('c.json').write_text(json.dumps(cfg))\n"
        )
        duplicated = block + "\n" + block

        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "config.py"
            p.write_text(duplicated, encoding="utf-8")
            fixes = check_edited_files_for_duplicates(tmp, ["config.py"])
            self.assertEqual(len(fixes), 1)
            self.assertEqual(fixes[0][0], "config.py")
            self.assertLess(len(fixes[0][1]), len(duplicated))

    def test_ignores_non_code_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "data.json"
            p.write_text('{"a": 1}\n' * 100, encoding="utf-8")
            fixes = check_edited_files_for_duplicates(tmp, ["data.json"])
            self.assertEqual(fixes, [])


class TestBuildAutoAdvanceMessage(unittest.TestCase):
    def test_basic_message(self):
        msg = build_auto_advance_message("2.1", "Create metadata.json")
        self.assertIn("2.1", msg)
        self.assertIn("Implement only implementation task", msg)
        self.assertIn("Create metadata.json", msg)

    def test_without_text(self):
        msg = build_auto_advance_message("3.1")
        self.assertEqual(msg, "Implement only implementation task 3.1")


class TestFeatureFlags(unittest.TestCase):
    @patch.dict(os.environ, {"BV_IMPLEMENT_VERIFY": "0"})
    def test_verify_disabled(self):
        from bright_vision_core.implement_verify import verify_enabled
        self.assertFalse(verify_enabled())

    @patch.dict(os.environ, {"BV_IMPLEMENT_AUTO_ADVANCE": "0"})
    def test_auto_advance_disabled(self):
        from bright_vision_core.implement_verify import auto_advance_enabled
        self.assertFalse(auto_advance_enabled())

    @patch.dict(os.environ, {"BV_DUPLICATE_DETECT": "0"})
    def test_duplicate_detect_disabled(self):
        from bright_vision_core.implement_verify import duplicate_detect_enabled
        self.assertFalse(duplicate_detect_enabled())

    @patch.dict(os.environ, {}, clear=False)
    def test_defaults_enabled(self):
        from bright_vision_core.implement_verify import (
            auto_advance_enabled,
            duplicate_detect_enabled,
            verify_enabled,
        )
        # Remove any overrides
        os.environ.pop("BV_IMPLEMENT_VERIFY", None)
        os.environ.pop("BV_IMPLEMENT_AUTO_ADVANCE", None)
        os.environ.pop("BV_DUPLICATE_DETECT", None)
        self.assertTrue(verify_enabled())
        self.assertTrue(auto_advance_enabled())
        self.assertTrue(duplicate_detect_enabled())


if __name__ == "__main__":
    unittest.main()
