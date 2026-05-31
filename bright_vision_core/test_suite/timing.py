"""Timing history for test-suite steps (ported from scripts/test_everything_timing.py)."""

from __future__ import annotations

import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MAX_HISTORY = 50
MIN_RUNS_FOR_WARN = 3
SLOW_MEDIAN_FACTOR = 2.5
SLOW_P90_FACTOR = 1.5

REAL_SECONDS_RE = re.compile(
    r"^real\s+.*?\(([0-9]+(?:\.[0-9]+)?)\s+s\)", re.MULTILINE
)
REAL_DAYS_RE = re.compile(r"^real\s+([0-9]+(?:\.[0-9]+)?)\s+days", re.MULTILINE)

GPUCAP_LINE_RE = re.compile(r"^GPUCAP\t([^\t]+)\t([^\t]+)", re.MULTILINE)

GPUCAP_FMT = r"\nGPUCAP\t%gA\t%gP\t%uA\t%uP\t%hA\t%hP\n"


def repo_root() -> Path:
    root = os.environ.get("BV_ROOT") or os.environ.get("BRIGHT_VISION_ENGINE")
    if root:
        return Path(root).resolve()
    return Path.cwd().resolve()


def history_path() -> Path:
    override = os.environ.get("TEST_EVERYTHING_TIMING_FILE")
    if override:
        return Path(override)
    return repo_root() / ".bright-vision" / "test-everything-timing.json"


def parse_btime_seconds(text: str) -> float | None:
    match = REAL_SECONDS_RE.search(text)
    if match:
        return float(match.group(1))
    match = REAL_DAYS_RE.search(text)
    if match:
        return float(match.group(1)) * 86400.0
    return None


def parse_gpucap_line(text: str) -> tuple[float | None, float | None]:
    match = GPUCAP_LINE_RE.search(text)
    if not match:
        return None, None
    try:
        return float(match.group(1)), float(match.group(2))
    except ValueError:
        return None, None


def load_history(path: Path | None = None) -> dict[str, Any]:
    path = path or history_path()
    if not path.is_file():
        return {"version": 1, "steps": {}, "totals": {"runs": []}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"version": 1, "steps": {}, "totals": {"runs": []}}
    if not isinstance(data, dict):
        return {"version": 1, "steps": {}, "totals": {"runs": []}}
    data.setdefault("version", 1)
    data.setdefault("steps", {})
    data.setdefault("totals", {"runs": []})
    return data


def save_history(data: dict[str, Any], path: Path | None = None) -> Path:
    path = path or history_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return path


def append_run(runs: list[dict[str, Any]], entry: dict[str, Any]) -> None:
    runs.append(entry)
    if len(runs) > MAX_HISTORY:
        del runs[: len(runs) - MAX_HISTORY]


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * pct
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return ordered[low]
    weight = rank - low
    return ordered[low] * (1.0 - weight) + ordered[high] * weight


def step_stats(runs: list[dict[str, Any]]) -> dict[str, float | int]:
    durations = [
        float(r["seconds"])
        for r in runs
        if r.get("ok", True) and isinstance(r.get("seconds"), (int, float))
    ]
    if not durations:
        return {"count": 0, "median": 0.0, "p90": 0.0, "mean": 0.0}
    return {
        "count": len(durations),
        "median": percentile(durations, 0.5),
        "p90": percentile(durations, 0.9),
        "mean": sum(durations) / len(durations),
    }


def format_duration(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes, secs = divmod(int(round(seconds)), 60)
    if minutes < 60:
        if secs == 0:
            return f"{minutes}m"
        return f"{minutes}m {secs}s"
    hours, minutes = divmod(minutes, 60)
    if minutes == 0:
        return f"{hours}h"
    return f"{hours}h {minutes}m"


def expected_threshold(stats: dict[str, float | int]) -> float:
    median = float(stats["median"])
    p90 = float(stats["p90"])
    return max(median * SLOW_MEDIAN_FACTOR, p90 * SLOW_P90_FACTOR)


def slow_warning(step_id: str, seconds: float, stats: dict[str, float | int]) -> str | None:
    count = int(stats["count"])
    if count < MIN_RUNS_FOR_WARN or seconds <= 0:
        return None
    threshold = expected_threshold(stats)
    if seconds <= threshold:
        return None
    median = float(stats["median"])
    p90 = float(stats["p90"])
    expected = median if median > 0 else float(stats["mean"])
    ratio = seconds / expected if expected > 0 else 0.0
    pct_over = int(round((seconds / threshold - 1.0) * 100)) if threshold > 0 else 0
    return (
        f"WARNING: {step_id} ran {format_duration(seconds)} "
        f"(expected ~{format_duration(expected)}, p90 {format_duration(p90)}); "
        f"{ratio:.1f}x median — possible flaky slowdown (+{pct_over}% over threshold)"
    )


def record_step(
    step_id: str,
    seconds: float,
    ok: bool,
    *,
    gpu_avg: float | None = None,
    gpu_peak: float | None = None,
) -> str | None:
    path = history_path()
    data = load_history(path)
    entry: dict[str, Any] = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "seconds": float(seconds),
        "ok": bool(ok),
    }
    if gpu_avg is not None:
        entry["gpu_avg"] = gpu_avg
    if gpu_peak is not None:
        entry["gpu_peak"] = gpu_peak
    step = data["steps"].setdefault(step_id, {"runs": []})
    append_run(step["runs"], entry)
    save_history(data, path)
    stats = step_stats(step.get("runs", []))
    return slow_warning(step_id, seconds, stats)


def record_total(seconds: float, ok: bool, step_ids: list[str]) -> None:
    path = history_path()
    data = load_history(path)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "seconds": float(seconds),
        "ok": bool(ok),
        "steps": step_ids,
    }
    totals = data.setdefault("totals", {"runs": []})
    append_run(totals["runs"], entry)
    save_history(data, path)


def medians_for_steps(step_ids: list[str]) -> list[dict[str, Any]]:
    data = load_history()
    out: list[dict[str, Any]] = []
    for step_id in step_ids:
        step = data["steps"].get(step_id, {"runs": []})
        stats = step_stats(step.get("runs", []))
        out.append(
            {
                "stepId": step_id,
                "medianSeconds": float(stats["median"]) if stats["count"] else 0.0,
                "sampleCount": int(stats["count"]),
            }
        )
    return out


def expectations_for_steps(step_ids: list[str]) -> dict[str, Any]:
    rows = medians_for_steps(step_ids)
    total_expected = sum(r["medianSeconds"] for r in rows)
    have_all = all(r["sampleCount"] > 0 for r in rows)
    missing = [r["stepId"] for r in rows if r["sampleCount"] == 0]
    return {
        "steps": rows,
        "totalExpectedSeconds": total_expected,
        "haveAllMedians": have_all,
        "missingMedians": missing,
    }
