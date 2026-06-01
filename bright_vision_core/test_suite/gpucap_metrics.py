"""Parse bgpucap/gpucap reports (JSON + legacy GPUCAP line) for Test Lab."""

from __future__ import annotations

import json
import os
import re
import subprocess
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from bright_vision_core.test_suite.timing import GPUCAP_FMT, parse_btime_seconds, parse_gpucap_line
from bright_vision_core.test_suite.brightdate_timing import (
    GPUCAP_FMT_BRIGHTDATE,
    format_bd_bounds,
    parse_btime_bd_bounds,
)

# Matches bgpucap 0.1.4+ JSON summary on stdout (schema "1").
# Group name is ``memory-detail`` (not ``mem-detail``); see ``bgpucap --list-metrics``.
_SUITE_METRICS = os.environ.get(
    "BV_GPUCAP_METRICS", "basic,memory-detail,pressure"
)


@dataclass
class StepCapture:
    """Normalized utilization from one wrapped suite step."""

    gpu_avg: float | None = None
    gpu_peak: float | None = None
    cpu_avg: float | None = None
    cpu_peak: float | None = None
    mem_avg: float | None = None
    mem_peak: float | None = None
    mem_pressure_avg: float | None = None
    mem_pressure_peak: float | None = None
    swap_peak_bytes: float | None = None
    elapsed_secs: float | None = None
    start_bd: float | None = None
    end_bd: float | None = None
    chip_brand: str | None = None
    json_mode: bool = False
    raw_metrics: dict[str, Any] = field(default_factory=dict)

    def to_event_fields(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        if self.gpu_avg is not None:
            out["gpuAvg"] = self.gpu_avg
        if self.gpu_peak is not None:
            out["gpuPeak"] = self.gpu_peak
        if self.cpu_avg is not None:
            out["cpuAvg"] = self.cpu_avg
        if self.cpu_peak is not None:
            out["cpuPeak"] = self.cpu_peak
        if self.mem_avg is not None:
            out["memAvg"] = self.mem_avg
        if self.mem_peak is not None:
            out["memPeak"] = self.mem_peak
        if self.mem_pressure_avg is not None:
            out["memPressureAvg"] = self.mem_pressure_avg
        if self.mem_pressure_peak is not None:
            out["memPressurePeak"] = self.mem_pressure_peak
        if self.swap_peak_bytes is not None and self.swap_peak_bytes > 0:
            out["swapPeakGb"] = round(self.swap_peak_bytes / (1024**3), 2)
        if self.chip_brand:
            out["chipBrand"] = self.chip_brand
        if self.start_bd is not None:
            out["startBd"] = self.start_bd
        if self.end_bd is not None:
            out["endBd"] = self.end_bd
        return out

    def to_history_fields(self) -> dict[str, Any]:
        hist: dict[str, Any] = {}
        for key in (
            "gpu_avg",
            "gpu_peak",
            "cpu_avg",
            "cpu_peak",
            "mem_avg",
            "mem_peak",
            "mem_pressure_avg",
            "mem_pressure_peak",
        ):
            val = getattr(self, key)
            if val is not None:
                hist[key] = val
        if self.swap_peak_bytes is not None and self.swap_peak_bytes > 0:
            hist["swap_peak_gb"] = round(self.swap_peak_bytes / (1024**3), 3)
        if self.start_bd is not None:
            hist["start_bd"] = self.start_bd
        if self.end_bd is not None:
            hist["end_bd"] = self.end_bd
        return hist


_ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
_WEBSERVER_NOISE_MARKERS = (
    "[WebServer]",
    "plugin:vite:reporter",
    "dynamically imported",
    "chunks are larger than",
    "chunkSizeWarningLimit",
)


def strip_ansi(text: str) -> str:
    return _ANSI_ESCAPE_RE.sub("", text)


def is_bgpucap_summary_json_line(line: str) -> bool:
    """True for the final ``bgpucap -f json`` report line (not Playwright/yarn stdout)."""
    s = line.strip()
    if not s.startswith("{"):
        return False
    compact = s.replace(" ", "")
    return '"schema":"1"' in compact and '"kind":"run"' in compact


def should_emit_stderr_line(line: str) -> bool:
    """Hide noisy Vite preview warnings unless explicitly enabled."""
    if os.environ.get("BV_SUITE_SHOW_VITE_LOG") == "1":
        return True
    if any(m in line for m in _WEBSERVER_NOISE_MARKERS):
        return False
    return True


def prefer_json_capture() -> bool:
    if os.environ.get("BV_GPUCAP_LEGACY_FMT") == "1":
        return False
    return os.environ.get("BV_GPUCAP_JSON", "1").strip().lower() not in (
        "0",
        "false",
        "no",
    )


def wrap_step_argv(
    gpu_bin: str,
    step_argv: tuple[str, ...],
    *,
    use_json: bool,
    use_brightdate: bool = False,
) -> list[str]:
    from bright_vision_core.test_suite.brightdate_timing import btime_command_argv

    btime_argv = btime_command_argv(step_argv, use_brightdate=use_brightdate)
    if use_json:
        return [
            gpu_bin,
            "-f",
            "json",
            "--metrics",
            _SUITE_METRICS,
            *btime_argv,
        ]
    fmt = GPUCAP_FMT_BRIGHTDATE if use_brightdate else GPUCAP_FMT
    return [gpu_bin, "-f", fmt, *btime_argv]


def _metric_pair(metrics: dict[str, Any], name: str) -> tuple[float | None, float | None]:
    block = metrics.get(name)
    if not isinstance(block, dict):
        return None, None
    avg = block.get("avg")
    peak = block.get("peak")
    try:
        a = round(float(avg), 1) if avg is not None else None
    except (TypeError, ValueError):
        a = None
    try:
        p = round(float(peak), 1) if peak is not None else None
    except (TypeError, ValueError):
        p = None
    return a, p


def parse_bgpucap_json(text: str) -> StepCapture | None:
    """Parse a single bgpucap ``-f json`` summary object from stdout."""
    raw = text.strip()
    if not raw:
        return None
    # NDJSON watch streams are not used here; take last non-empty line if multiple.
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    if not lines:
        return None
    payload = lines[-1]
    if not payload.startswith("{"):
        start = payload.find("{")
        if start < 0:
            return None
        payload = payload[start:]
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None

    metrics = data.get("metrics")
    if not isinstance(metrics, dict):
        metrics = {}

    cap = StepCapture(json_mode=True, raw_metrics=metrics)
    cap.gpu_avg, cap.gpu_peak = _metric_pair(metrics, "gpu")
    cap.cpu_avg, cap.cpu_peak = _metric_pair(metrics, "cpu")
    cap.mem_avg, cap.mem_peak = _metric_pair(metrics, "memory")
    cap.mem_pressure_avg, cap.mem_pressure_peak = _metric_pair(metrics, "mem_pressure")
    _, swap_peak = _metric_pair(metrics, "mem_swap")
    if swap_peak is not None:
        cap.swap_peak_bytes = swap_peak

    try:
        cap.elapsed_secs = float(data.get("elapsed_secs"))
    except (TypeError, ValueError):
        cap.elapsed_secs = None
    for key, attr in (("start_bd", "start_bd"), ("end_bd", "end_bd")):
        try:
            val = data.get(key)
            if val is not None:
                setattr(cap, attr, float(val))
        except (TypeError, ValueError):
            pass

    chip = data.get("chip")
    if isinstance(chip, dict):
        brand = chip.get("brand")
        if isinstance(brand, str) and brand.strip():
            cap.chip_brand = brand.strip()

    return cap


def capture_from_outputs(
    *,
    stdout_text: str,
    stderr_text: str,
    use_json: bool,
) -> StepCapture:
    if use_json:
        parsed = parse_bgpucap_json(stdout_text)
        if parsed is not None:
            if parsed.elapsed_secs is None:
                parsed.elapsed_secs = parse_btime_seconds(stderr_text)
            if parsed.start_bd is None or parsed.end_bd is None:
                start_bd, end_bd = parse_btime_bd_bounds(stderr_text)
                if parsed.start_bd is None:
                    parsed.start_bd = start_bd
                if parsed.end_bd is None:
                    parsed.end_bd = end_bd
            return parsed

    cap = StepCapture(json_mode=False)
    cap.elapsed_secs = parse_btime_seconds(stderr_text)
    start_bd, end_bd = parse_btime_bd_bounds(stderr_text)
    cap.start_bd, cap.end_bd = start_bd, end_bd
    gpu_avg, gpu_peak = parse_gpucap_line(stderr_text)
    cap.gpu_avg, cap.gpu_peak = gpu_avg, gpu_peak
    # Legacy format line includes %hA/%hP — re-parse if present.
    mem_match = re.search(
        r"^GPUCAP\t[^\t]+\t[^\t]+\t[^\t]+\t[^\t]+\t([^\t]+)\t([^\t]+)",
        stderr_text,
        re.MULTILINE,
    )
    if mem_match:
        try:
            cap.mem_avg = round(float(mem_match.group(1)), 1)
            cap.mem_peak = round(float(mem_match.group(2)), 1)
        except ValueError:
            pass
    return cap


def pressure_label(peak: float | None) -> str | None:
    if peak is None:
        return None
    if peak >= 2.0:
        return "critical"
    if peak >= 1.0:
        return "warn"
    return "ok"


def format_capture_summary(cap: StepCapture, *, use_brightdate: bool = False) -> str:
    parts: list[str] = []
    bounds = format_bd_bounds(cap.start_bd, cap.end_bd)
    if bounds:
        parts.append(bounds)
    if cap.gpu_peak is not None:
        parts.append(f"GPU {cap.gpu_avg or 0:.0f}% / {cap.gpu_peak:.0f}%")
    if cap.mem_peak is not None:
        parts.append(f"RAM {cap.mem_avg or 0:.0f}% / {cap.mem_peak:.0f}%")
    if cap.mem_pressure_peak is not None:
        label = pressure_label(cap.mem_pressure_peak) or "?"
        parts.append(f"pressure {cap.mem_pressure_peak:.0f} ({label})")
    if cap.swap_peak_bytes and cap.swap_peak_bytes > 0:
        parts.append(f"swap peak {cap.swap_peak_bytes / (1024**3):.2f} GiB")
    if cap.cpu_peak is not None:
        parts.append(f"CPU {cap.cpu_avg or 0:.0f}% / {cap.cpu_peak:.0f}%")
    return " · ".join(parts)


def maybe_compare_baseline(
    gpu_bin: str,
    step_id: str,
    capture_json_text: str,
    *,
    repo_root: str,
    on_line: Callable[[str], None] | None = None,
) -> None:
    """Optional: ``bgpucap compare`` vs last green run for this step."""
    if os.environ.get("BV_GPUCAP_COMPARE", "1").strip().lower() in ("0", "false", "no"):
        return
    from pathlib import Path

    baseline_dir = Path(repo_root) / ".bright-vision" / "baselines"
    baseline = baseline_dir / f"{step_id}.json"
    if not baseline.is_file():
        return
    tmp = baseline_dir / f".{step_id}.last.json"
    try:
        tmp.write_text(capture_json_text.strip().splitlines()[-1] + "\n", encoding="utf-8")
        proc = subprocess.run(
            [gpu_bin, "compare", str(baseline), str(tmp)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        text = (proc.stderr or proc.stdout or "").strip()
        if text and on_line:
            for line in text.splitlines():
                on_line(line)
    except (OSError, subprocess.TimeoutExpired):
        pass
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass


def save_baseline_json(step_id: str, capture_json_text: str, *, repo_root: str, ok: bool) -> None:
    if not ok or os.environ.get("BV_GPUCAP_BASELINE", "0") != "1":
        return
    from pathlib import Path

    lines = [ln for ln in capture_json_text.strip().splitlines() if ln.strip()]
    if not lines:
        return
    baseline_dir = Path(repo_root) / ".bright-vision" / "baselines"
    baseline_dir.mkdir(parents=True, exist_ok=True)
    (baseline_dir / f"{step_id}.json").write_text(lines[-1] + "\n", encoding="utf-8")
