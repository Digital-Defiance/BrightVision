#!/usr/bin/env python3
"""Timing history + flaky-run detection for scripts/test-everything.sh."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
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

STEP_ORDER = (
    "dogfood:check",
    "test-local:release",
    "e2e:fixtures",
    "llm:core",
    "e2e:llm",
    "e2e:llm:superproject",
)


def default_history_path() -> Path:
    override = os.environ.get("TEST_EVERYTHING_TIMING_FILE")
    if override:
        return Path(override)
    root = os.environ.get("BV_ROOT")
    if root:
        return Path(root) / ".bright-vision" / "test-everything-timing.json"
    return Path.cwd() / ".bright-vision" / "test-everything-timing.json"


def parse_btime_seconds(text: str) -> float | None:
    match = REAL_SECONDS_RE.search(text)
    if match:
        return float(match.group(1))
    match = REAL_DAYS_RE.search(text)
    if match:
        return float(match.group(1)) * 86400.0
    return None


def load_history(path: Path) -> dict[str, Any]:
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


def save_history(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


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


def cmd_parse(args: argparse.Namespace) -> int:
    text = Path(args.file).read_text(encoding="utf-8", errors="replace")
    seconds = parse_btime_seconds(text)
    if seconds is None:
        print("0", file=sys.stdout)
        return 1
    print(f"{seconds:.6f}")
    return 0


def _opt_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def cmd_record(args: argparse.Namespace) -> int:
    path = default_history_path()
    data = load_history(path)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "seconds": float(args.seconds),
        "ok": bool(int(args.ok)),
    }
    gpu_avg = _opt_float(getattr(args, "gpu_avg", None))
    gpu_peak = _opt_float(getattr(args, "gpu_peak", None))
    if gpu_avg is not None:
        entry["gpu_avg"] = gpu_avg
    if gpu_peak is not None:
        entry["gpu_peak"] = gpu_peak
    steps: dict[str, Any] = data["steps"]
    step = steps.setdefault(args.step_id, {"runs": []})
    append_run(step["runs"], entry)
    save_history(path, data)
    return 0


def cmd_record_total(args: argparse.Namespace) -> int:
    path = default_history_path()
    data = load_history(path)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "seconds": float(args.seconds),
        "ok": bool(int(args.ok)),
        "steps": args.steps.split(",") if args.steps else [],
    }
    totals = data.setdefault("totals", {"runs": []})
    append_run(totals["runs"], entry)
    save_history(path, data)
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    path = default_history_path()
    data = load_history(path)
    step = data["steps"].get(args.step_id, {"runs": []})
    stats = step_stats(step.get("runs", []))
    warning = slow_warning(args.step_id, float(args.seconds), stats)
    if warning:
        print(warning, file=sys.stderr)
        return 0
    return 0


def cmd_format_duration(args: argparse.Namespace) -> int:
    print(format_duration(float(args.seconds)))
    return 0


def cmd_expected(args: argparse.Namespace) -> int:
    path = default_history_path()
    data = load_history(path)
    step_ids = args.step_ids or list(STEP_ORDER)
    total = 0.0
    for step_id in step_ids:
        step = data["steps"].get(step_id, {"runs": []})
        stats = step_stats(step.get("runs", []))
        total += float(stats["median"]) if stats["count"] else 0.0
    print(f"{total:.6f}")
    return 0


def cmd_medians(args: argparse.Namespace) -> int:
    """Print ``step_id<TAB>median_seconds<TAB>count`` per requested step (in order).

    Used by test-everything.sh to drive the live progress bar / ETA.
    """
    path = default_history_path()
    data = load_history(path)
    step_ids = args.step_ids or list(STEP_ORDER)
    for step_id in step_ids:
        step = data["steps"].get(step_id, {"runs": []})
        stats = step_stats(step.get("runs", []))
        median = float(stats["median"]) if stats["count"] else 0.0
        print(f"{step_id}\t{median:.3f}\t{int(stats['count'])}")
    return 0


def cmd_summary(args: argparse.Namespace) -> int:
    path = default_history_path()
    data = load_history(path)
    rows: list[
        tuple[str, str, float, float, float, float, str | None, float | None, float | None]
    ] = []

    for item in args.run.split(";"):
        if not item.strip():
            continue
        parts = item.split("|")
        if len(parts) < 3:
            continue
        step_id, label, seconds_s = parts[0], parts[1], parts[2]
        seconds = float(seconds_s)
        gpu_avg = _opt_float(parts[3]) if len(parts) > 3 else None
        gpu_peak = _opt_float(parts[4]) if len(parts) > 4 else None
        step = data["steps"].get(step_id, {"runs": []})
        stats = step_stats(step.get("runs", []))
        expected = float(stats["median"]) if stats["count"] else 0.0
        warning = slow_warning(step_id, seconds, stats)
        rows.append(
            (
                step_id,
                label,
                seconds,
                expected,
                float(stats["p90"]),
                int(stats["count"]),
                warning,
                gpu_avg,
                gpu_peak,
            )
        )

    if not rows:
        return 0

    total_actual = sum(r[2] for r in rows)
    total_expected = sum(r[3] for r in rows)

    totals = data.get("totals", {"runs": []})
    total_stats = step_stats(totals.get("runs", []))
    hist_total_expected = float(total_stats["median"]) if total_stats["count"] else 0.0

    print()
    print("Timing summary")
    print("----------------------------------------------------------------------------------")
    label_width = max(len(r[1]) for r in rows)
    for _step_id, label, seconds, expected, p90, count, warning, gpu_avg, gpu_peak in rows:
        line = f"  {label:<{label_width}}  {format_duration(seconds):>8}"
        if count >= MIN_RUNS_FOR_WARN and expected > 0:
            line += f"   expected ~{format_duration(expected)} (p90 {format_duration(p90)}, n={count})"
        elif count > 0:
            line += f"   history n={count} (building baseline)"
        else:
            line += "   (first recorded run)"
        if gpu_avg is not None or gpu_peak is not None:
            ga = f"{gpu_avg:.1f}" if gpu_avg is not None else "—"
            gp = f"{gpu_peak:.1f}" if gpu_peak is not None else "—"
            line += f"   gpu avg {ga}% peak {gp}%"
        print(line)
        if warning:
            print(f"    ⚠ {warning}")

    print("----------------------------------------------------------------------------------")
    total_line = f"  {'Total':<{label_width}}  {format_duration(total_actual):>8}"
    if total_expected > 0:
        total_line += f"   expected ~{format_duration(total_expected)} (sum of step medians)"
    print(total_line)

    # GPU rollup for this run: duration-weighted overall average + averaged peak.
    gpu_rows = [(r[2], r[7], r[8]) for r in rows if r[7] is not None or r[8] is not None]
    avg_rows = [(secs, ga) for secs, ga, _ in gpu_rows if ga is not None]
    peak_vals = [gp for _, _, gp in gpu_rows if gp is not None]
    if avg_rows or peak_vals:
        gpu_line = "  GPU (run):"
        if avg_rows:
            weight = sum(secs for secs, _ in avg_rows)
            if weight > 0:
                overall_avg = sum(secs * ga for secs, ga in avg_rows) / weight
                basis = "duration-weighted"
            else:
                overall_avg = sum(ga for _, ga in avg_rows) / len(avg_rows)
                basis = "mean"
            gpu_line += f" overall avg {overall_avg:.1f}% ({basis})"
        if peak_vals:
            avg_peak = sum(peak_vals) / len(peak_vals)
            sep = "," if avg_rows else ""
            gpu_line += f"{sep} averaged peak {avg_peak:.1f}% (max {max(peak_vals):.1f}%)"
        print(gpu_line)

    if int(total_stats["count"]) >= MIN_RUNS_FOR_WARN and hist_total_expected > 0:
        print(
            f"  Historical full-suite median: {format_duration(hist_total_expected)} "
            f"(p90 {format_duration(float(total_stats['p90']))}, n={total_stats['count']})"
        )
        total_warning = slow_warning("total", total_actual, total_stats)
        if total_warning:
            print(f"  ⚠ {total_warning.replace('WARNING: total ran', 'Total ran')}")

    print(f"  History file: {path}")
    print()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_parse = sub.add_parser("parse", help="Parse btime stderr; print real seconds")
    p_parse.add_argument("--file", required=True)
    p_parse.set_defaults(func=cmd_parse)

    p_record = sub.add_parser("record", help="Append a step timing to history")
    p_record.add_argument("--step-id", required=True)
    p_record.add_argument("--seconds", required=True)
    p_record.add_argument("--ok", choices=("0", "1"), required=True)
    p_record.add_argument("--gpu-avg", default="", help="gpucap avg GPU percent")
    p_record.add_argument("--gpu-peak", default="", help="gpucap peak GPU percent")
    p_record.set_defaults(func=cmd_record)

    p_record_total = sub.add_parser("record-total", help="Append full-suite total to history")
    p_record_total.add_argument("--seconds", required=True)
    p_record_total.add_argument("--ok", choices=("0", "1"), required=True)
    p_record_total.add_argument("--steps", default="")
    p_record_total.set_defaults(func=cmd_record_total)

    p_check = sub.add_parser("check", help="Print warning if step is unusually slow")
    p_check.add_argument("--step-id", required=True)
    p_check.add_argument("--seconds", required=True)
    p_check.set_defaults(func=cmd_check)

    p_format = sub.add_parser("format-duration", help="Format seconds for humans")
    p_format.add_argument("--seconds", required=True)
    p_format.set_defaults(func=cmd_format_duration)

    p_expected = sub.add_parser("expected", help="Print expected total seconds for step ids")
    p_expected.add_argument("step_ids", nargs="*")
    p_expected.set_defaults(func=cmd_expected)

    p_medians = sub.add_parser(
        "medians", help="Print step_id<TAB>median<TAB>count per step (progress bar/ETA)"
    )
    p_medians.add_argument("step_ids", nargs="*")
    p_medians.set_defaults(func=cmd_medians)

    p_summary = sub.add_parser("summary", help="Print run timing summary")
    p_summary.add_argument(
        "--run",
        required=True,
        help="Semicolon-separated step_id|label|seconds entries",
    )
    p_summary.set_defaults(func=cmd_summary)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
