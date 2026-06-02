"""BrightDate app integration (env, btime, bgpucap) on top of the ``brightdate`` PyPI package."""

from __future__ import annotations

import os

from brightdate import (
    J2000_UNIX_MS,
    J2000_UNIX_SECONDS,
    SECONDS_PER_BD,
    SECONDS_PER_MD,
    bd_add_seconds,
    bd_from_unix_ms,
    bd_from_unix_seconds,
    format_bd_bounds,
    format_bd_scalar,
    format_etc,
    parse_bd_bounds,
)
from brightdate.format import format_duration as format_elapsed_brightdate

# Re-export for bright_vision_core consumers and tests.
__all__ = [
    "GPUCAP_FMT_BRIGHTDATE",
    "J2000_UNIX_MS",
    "J2000_UNIX_SECONDS",
    "SECONDS_PER_BD",
    "SECONDS_PER_MD",
    "bd_add_seconds",
    "bd_from_unix_ms",
    "bd_from_unix_seconds",
    "brightdate_enabled",
    "btime_command_argv",
    "format_bd_bounds",
    "format_bd_scalar",
    "format_elapsed_brightdate",
    "format_etc_brightdate",
    "parse_btime_bd_bounds",
]

# bgpucap legacy line with BrightDate wall start/end + elapsed millidays.
GPUCAP_FMT_BRIGHTDATE = (
    r"\nGPUCAP\t%gA\t%gP\t%uA\t%uP\t%hA\t%hP\t%Ws\t%Wt\t%dE md\n"
)


def brightdate_enabled() -> bool:
    """True when BrightDate display/recording mode is on (app or Test Lab)."""
    return os.environ.get("BV_USE_BRIGHTDATE", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    ) or os.environ.get("BV_SUITE_USE_BRIGHTDATE", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def format_etc_brightdate(seconds_from_now: float, *, now_bd: float | None = None) -> str:
    return format_etc(seconds_from_now, now_bd=now_bd)


def parse_btime_bd_bounds(text: str) -> tuple[float | None, float | None]:
    return parse_bd_bounds(text)


def btime_command_argv(step_argv: tuple[str, ...], *, use_brightdate: bool) -> list[str]:
    """Wrap a suite step with ``btime`` (BrightDate-native timing on stderr)."""
    if use_brightdate:
        return ["btime", "--no-color", *step_argv]
    return ["btime", *step_argv]
