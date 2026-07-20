"""Turn-level resource capture (bgpucap + heartbeat fallback)."""

from __future__ import annotations

import subprocess
import unittest
from unittest.mock import MagicMock, patch

from bright_vision_core.turn_metrics import TurnMetricsCollector


class TestTurnMetrics(unittest.TestCase):
    def test_stop_returns_capture_with_bd_bounds(self):
        collector = TurnMetricsCollector()
        with patch(
            "bright_vision_core.turn_metrics.resolve_capture_mode",
            return_value="btime_only",
        ):
            with patch(
                "bright_vision_core.turn_metrics.sample_utilization",
                return_value=type(
                    "S",
                    (),
                    {
                        "cpu_pct": 10.0,
                        "gpu_pct": None,
                        "mem_pct": 50.0,
                        "mem_pressure": 1.0,
                    },
                )(),
            ):
                collector.start()
                cap = collector.stop()
        self.assertIsNotNone(cap)
        assert cap is not None
        self.assertGreater(cap.end_bd, cap.start_bd)
        self.assertEqual(cap.capture_mode, "btime_only")
        self.assertGreaterEqual(cap.sample_count, 1)

    def test_attach_turn_capture_idempotent(self):
        collector = TurnMetricsCollector()
        with patch(
            "bright_vision_core.turn_metrics.resolve_capture_mode",
            return_value="off",
        ):
            collector.start()
            first = collector.stop()
            second = collector.stop()
        self.assertIsNotNone(first)
        self.assertIsNone(second)

    def test_bgpucap_shutdown_timeout_does_not_raise(self):
        collector = TurnMetricsCollector()
        collector._active = True
        collector._start_unix = 1.0
        proc = MagicMock()
        proc.communicate.side_effect = subprocess.TimeoutExpired(cmd=["bgpucap"], timeout=5)
        collector._bgpucap_proc = proc
        collector._capture_mode = "bgpucap"
        with patch(
            "bright_vision_core.turn_metrics.sample_utilization",
            return_value=type(
                "S",
                (),
                {"cpu_pct": 1.0, "gpu_pct": None, "mem_pct": 1.0, "mem_pressure": None},
            )(),
        ):
            with patch("bright_vision_core.turn_metrics.time.time", return_value=2.0):
                cap = collector.stop()
        self.assertIsNotNone(cap)
        proc.kill.assert_called()


if __name__ == "__main__":
    unittest.main()
