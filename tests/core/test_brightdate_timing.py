"""BrightDate timing helpers for Test Lab."""

from __future__ import annotations

import os
import unittest

from bright_vision_core.brightdate import (
    J2000_UNIX_MS,
    bd_add_seconds,
    bd_from_unix_ms,
    format_bd_scalar,
    format_elapsed_brightdate,
    format_etc_brightdate,
    parse_btime_bd_bounds,
)
from bright_vision_core.test_suite.gpucap_metrics import (
    capture_from_outputs,
    format_capture_summary,
    wrap_step_argv,
)
from bright_vision_core.test_suite.timing import format_duration


BTIME_SAMPLE = """\
real     0.000003601 days  (0.311140 s)
start    9648.252074201
end      9648.252074236
"""


class TestBrightdateTiming(unittest.TestCase):
    def test_j2000_epoch_matches_btime_and_spec(self):
        """BD 0 at spec UTC label; aligns with btime start/end lines (not ~0.5 BD high)."""
        self.assertEqual(J2000_UNIX_MS, 946_727_935_816)
        self.assertAlmostEqual(bd_from_unix_ms(J2000_UNIX_MS), 0.0, places=9)
        start, end = parse_btime_bd_bounds(BTIME_SAMPLE)
        assert start is not None and end is not None
        self.assertGreater(end, start)
        self.assertLess(end - start, 0.001)

    def test_etc_additive_matches_wall_clock(self):
        base = 9648.25
        etc_bd = bd_add_seconds(base, 86.4)  # 1 md
        self.assertAlmostEqual(etc_bd, base + 0.001, places=6)

    def test_parse_btime_bd_bounds(self):
        start, end = parse_btime_bd_bounds(BTIME_SAMPLE)
        self.assertAlmostEqual(start or 0, 9648.252074201, places=6)
        self.assertAlmostEqual(end or 0, 9648.252074236, places=6)

    def test_format_elapsed_brightdate(self):
        self.assertIn("md", format_elapsed_brightdate(43.2))

    def test_format_duration_respects_env(self):
        os.environ["BV_SUITE_USE_BRIGHTDATE"] = "1"
        try:
            self.assertIn("md", format_duration(30.0))
        finally:
            os.environ.pop("BV_SUITE_USE_BRIGHTDATE", None)

    def test_wrap_step_argv_brightdate_legacy(self):
        argv = wrap_step_argv(
            "/usr/local/bin/bgpucap",
            ("yarn", "test"),
            use_json=False,
            use_brightdate=True,
        )
        self.assertIn("%Ws", argv[argv.index("-f") + 1])

    def test_capture_legacy_includes_bd_bounds(self):
        stderr = BTIME_SAMPLE + "GPUCAP\t12.0\t40.0\t5.0\t10.0\t60.0\t70.0\n"
        cap = capture_from_outputs(stdout_text="", stderr_text=stderr, use_json=False)
        self.assertAlmostEqual(cap.start_bd or 0, 9648.252074201, places=6)
        hist = cap.to_history_fields()
        self.assertIn("start_bd", hist)
        self.assertIn("end_bd", hist)
        summary = format_capture_summary(cap, use_brightdate=False)
        self.assertIn("BD", summary)


if __name__ == "__main__":
    unittest.main()
