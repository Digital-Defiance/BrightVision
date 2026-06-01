"""BrightDate ([brightdate.org](https://brightdate.org)) timing for Test Lab / btime / bgpucap."""

from __future__ import annotations

import os
import re
import time

# J2000.0 = 2000-01-01T11:58:55.816Z (Unix seconds with fractional ms).
J2000_UNIX_SECONDS = 946_684_800.816
SECONDS_PER_BD = 86_400.0
SECONDS_PER_MD = 86.4

START_BD_RE = re.compile(r"^start\s+([0-9]+(?:\.[0-9]+)?)\s*$", re.MULTILINE)
END_BD_RE = re.compile(r"^end\s+([0-9]+(?:\.[0-9]+)?)\s*$", re.MULTILINE)

# bgpucap legacy line with BrightDate wall start/end + elapsed millidays.
GPUCAP_FMT_BRIGHTDATE = (
    r"\nGPUCAP\t%gA\t%gP\t%uA\t%uP\t%hA\t%hP\t%Ws\t%Wt\t%dE md\n"
)


def brightdate_enabled() -> bool:
    return os.environ.get("BV_SUITE_USE_BRIGHTDATE") == "1"


def bd_from_unix_seconds(unix_s: float) -> float:
    return (unix_s - J2000_UNIX_SECONDS) / SECONDS_PER_BD


def bd_from_unix_ms(unix_ms: float) -> float:
    return bd_from_unix_seconds(unix_ms / 1000.0)


def format_bd_scalar(bd: float, *, precision: int = 5) -> str:
    if bd >= 0:
        return f"BD {bd:.{precision}f}".rstrip("0").rstrip(".")
    return f"PBD {abs(bd):.{precision}f}".rstrip("0").rstrip(".")


def format_elapsed_brightdate(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    md = seconds / SECONDS_PER_MD
    if seconds < SECONDS_PER_MD:
        return f"{md:.2f} md"
    days = seconds / SECONDS_PER_BD
    return f"{days:.5f} d ({md:.1f} md)"


def format_etc_brightdate(seconds_from_now: float) -> str:
    bd = bd_from_unix_seconds(time.time() + seconds_from_now)
    return format_bd_scalar(bd)


def parse_btime_bd_bounds(text: str) -> tuple[float | None, float | None]:
    start_m = START_BD_RE.search(text)
    end_m = END_BD_RE.search(text)
    start = float(start_m.group(1)) if start_m else None
    end = float(end_m.group(1)) if end_m else None
    return start, end


def format_bd_bounds(start_bd: float | None, end_bd: float | None, *, precision: int = 6) -> str | None:
    if start_bd is None or end_bd is None:
        return None
    return f"BD {start_bd:.{precision}f} → {end_bd:.{precision}f}"


def btime_command_argv(step_argv: tuple[str, ...], *, use_brightdate: bool) -> list[str]:
    """Wrap a suite step with ``btime`` (BrightDate-native timing on stderr)."""
    if use_brightdate:
        return ["btime", "--no-color", *step_argv]
    return ["btime", *step_argv]
