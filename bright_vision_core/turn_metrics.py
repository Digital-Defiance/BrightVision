"""Per-turn resource capture for Vision chat (bgpucap when available, heartbeat fallback)."""

from __future__ import annotations

import os
import subprocess
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from brightdate import bd_from_unix_seconds
from bright_vision_core.test_suite.capture_mode import gpu_capture_bin, resolve_capture_mode
from bright_vision_core.test_suite.gpucap_metrics import parse_bgpucap_json
from bright_vision_core.test_suite.resources import UtilizationSample, sample_utilization

_BGPUCAP_METRICS = os.environ.get("BV_GPUCAP_METRICS", "basic,memory-detail,pressure")
_HEARTBEAT_INTERVAL_S = float(os.environ.get("BV_TURN_METRICS_INTERVAL_S", "1.0"))


def _max_optional(a: float | None, b: float | None) -> float | None:
    if a is None:
        return b
    if b is None:
        return a
    return max(a, b)


def _avg_optional(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


@dataclass
class TurnCapture:
    """Normalized utilization for one chat turn."""

    capture_mode: str
    elapsed_secs: float
    start_bd: float
    end_bd: float
    cpu_peak: float | None = None
    cpu_avg: float | None = None
    mem_peak: float | None = None
    mem_avg: float | None = None
    gpu_peak: float | None = None
    gpu_avg: float | None = None
    mem_pressure_peak: float | None = None
    sample_count: int = 0
    chip_brand: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "captureMode": self.capture_mode,
            "elapsedSecs": round(self.elapsed_secs, 3),
            "startBd": self.start_bd,
            "endBd": self.end_bd,
            "sampleCount": self.sample_count,
        }
        for key, val in (
            ("cpuPeak", self.cpu_peak),
            ("cpuAvg", self.cpu_avg),
            ("memPeak", self.mem_peak),
            ("memAvg", self.mem_avg),
            ("gpuPeak", self.gpu_peak),
            ("gpuAvg", self.gpu_avg),
            ("memPressurePeak", self.mem_pressure_peak),
        ):
            if val is not None:
                out[key] = val
        if self.chip_brand:
            out["chipBrand"] = self.chip_brand
        return out


@dataclass
class TurnMetricsCollector:
    """Sample utilization during a Vision turn; prefer bgpucap --pid when available."""

    _start_unix: float = 0.0
    _end_unix: float = 0.0
    _capture_mode: str = "off"
    _samples: list[UtilizationSample] = field(default_factory=list)
    _stop_heartbeat: threading.Event = field(default_factory=threading.Event)
    _heartbeat_thread: threading.Thread | None = None
    _bgpucap_proc: subprocess.Popen[str] | None = None
    _bgpucap_stdout: list[str] = field(default_factory=list)
    _active: bool = False

    def start(self, *, pid: int | None = None) -> None:
        if self._active:
            return
        self._active = True
        self._start_unix = time.time()
        self._capture_mode = resolve_capture_mode()
        self._stop_heartbeat.clear()
        self._samples = []

        self._heartbeat_thread = threading.Thread(
            target=self._heartbeat_loop,
            name="bv-turn-metrics",
            daemon=True,
        )
        self._heartbeat_thread.start()

        if self._capture_mode == "bgpucap":
            self._start_bgpucap(pid or os.getpid())

    def stop(self) -> TurnCapture | None:
        if not self._active:
            return None
        self._active = False
        self._end_unix = time.time()
        self._stop_heartbeat.set()
        if self._heartbeat_thread is not None:
            self._heartbeat_thread.join(timeout=5.0)
            self._heartbeat_thread = None

        bgpucap_cap = self._finish_bgpucap()
        return self._build_capture(bgpucap_cap)

    def _heartbeat_loop(self) -> None:
        while not self._stop_heartbeat.wait(_HEARTBEAT_INTERVAL_S):
            try:
                self._samples.append(sample_utilization())
            except Exception:
                pass
        try:
            self._samples.append(sample_utilization())
        except Exception:
            pass

    def _start_bgpucap(self, pid: int) -> None:
        bin_path = gpu_capture_bin()
        if not bin_path:
            self._capture_mode = "btime_only"
            return
        try:
            self._bgpucap_proc = subprocess.Popen(
                [
                    bin_path,
                    "-f",
                    "json",
                    "--metrics",
                    _BGPUCAP_METRICS,
                    "--pid",
                    str(pid),
                    "sleep",
                    "86400",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
        except OSError:
            self._bgpucap_proc = None
            self._capture_mode = "btime_only"

    def _finish_bgpucap(self):
        proc = self._bgpucap_proc
        self._bgpucap_proc = None
        if proc is None:
            return None
        stdout_text = ""
        try:
            proc.terminate()
            try:
                stdout_text, _ = proc.communicate(timeout=12)
            except subprocess.TimeoutExpired:
                proc.kill()
                try:
                    stdout_text, _ = proc.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    return None
        except OSError:
            return None
        if not stdout_text:
            return None
        return parse_bgpucap_json(stdout_text)

    def _build_capture(self, bgpucap_cap) -> TurnCapture:
        elapsed = max(0.0, self._end_unix - self._start_unix)
        start_bd = bd_from_unix_seconds(self._start_unix)
        end_bd = bd_from_unix_seconds(self._end_unix)

        cpu_vals = [s.cpu_pct for s in self._samples if s.cpu_pct is not None]
        mem_vals = [s.mem_pct for s in self._samples if s.mem_pct is not None]
        gpu_vals = [s.gpu_pct for s in self._samples if s.gpu_pct is not None]
        pressure_vals = [
            s.mem_pressure for s in self._samples if s.mem_pressure is not None
        ]

        cap = TurnCapture(
            capture_mode=self._capture_mode,
            elapsed_secs=elapsed,
            start_bd=start_bd,
            end_bd=end_bd,
            cpu_peak=max(cpu_vals) if cpu_vals else None,
            cpu_avg=_avg_optional(cpu_vals),
            mem_peak=max(mem_vals) if mem_vals else None,
            mem_avg=_avg_optional(mem_vals),
            gpu_peak=max(gpu_vals) if gpu_vals else None,
            gpu_avg=_avg_optional(gpu_vals),
            mem_pressure_peak=max(pressure_vals) if pressure_vals else None,
            sample_count=len(self._samples),
        )

        if bgpucap_cap is not None:
            cap.capture_mode = "bgpucap"
            cap.cpu_peak = _max_optional(cap.cpu_peak, bgpucap_cap.cpu_peak)
            cap.cpu_avg = bgpucap_cap.cpu_avg or cap.cpu_avg
            cap.mem_peak = _max_optional(cap.mem_peak, bgpucap_cap.mem_peak)
            cap.mem_avg = bgpucap_cap.mem_avg or cap.mem_avg
            cap.gpu_peak = _max_optional(cap.gpu_peak, bgpucap_cap.gpu_peak)
            cap.gpu_avg = bgpucap_cap.gpu_avg or cap.gpu_avg
            cap.mem_pressure_peak = _max_optional(
                cap.mem_pressure_peak, bgpucap_cap.mem_pressure_peak
            )
            if bgpucap_cap.start_bd is not None:
                cap.start_bd = bgpucap_cap.start_bd
            if bgpucap_cap.end_bd is not None:
                cap.end_bd = bgpucap_cap.end_bd
            if bgpucap_cap.chip_brand:
                cap.chip_brand = bgpucap_cap.chip_brand

        return cap


def record_brightdate_env(enabled: bool) -> None:
    """Set process env for BrightDate mode (called when desktop restarts Vision API)."""
    if enabled:
        os.environ["BV_USE_BRIGHTDATE"] = "1"
    else:
        os.environ.pop("BV_USE_BRIGHTDATE", None)
