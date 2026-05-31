"""Unit tests for scripts/test_everything_timing.py"""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_SPEC = importlib.util.spec_from_file_location(
    "test_everything_timing",
    _ROOT / "scripts" / "test_everything_timing.py",
)
assert _SPEC and _SPEC.loader
_mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_mod)

BTIME_SAMPLE = """
real     0.000035280 days  (3.048226 s)
         0.035280 millidays
         35.280 microdays
         35280 nanodays
user     18.414703 s  (0.213133 millidays)
sys      7.150376 s  (0.082759 millidays)
cpu      838.0%
start    9646.281547766
end      9646.281583032
"""


class TestEverythingTiming(unittest.TestCase):
    def test_parse_real_seconds(self) -> None:
        self.assertAlmostEqual(_mod.parse_btime_seconds(BTIME_SAMPLE), 3.048226)

    def test_append_run_caps_history(self) -> None:
        runs: list[dict] = []
        for i in range(_mod.MAX_HISTORY + 5):
            _mod.append_run(runs, {"seconds": float(i)})
        self.assertEqual(len(runs), _mod.MAX_HISTORY)
        self.assertEqual(runs[0]["seconds"], 5.0)

    def test_slow_warning_when_above_threshold(self) -> None:
        stats = {"count": 5, "median": 10.0, "p90": 12.0, "mean": 10.0}
        self.assertIsNotNone(_mod.slow_warning("x", 30.0, stats))

    def test_save_and_load(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "timing.json"
            data = {"version": 1, "steps": {}, "totals": {"runs": []}}
            _mod.save_history(path, data)
            loaded = _mod.load_history(path)
            self.assertEqual(loaded["version"], 1)
