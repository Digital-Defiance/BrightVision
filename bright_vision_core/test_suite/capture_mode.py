"""Suite resource capture: bgpucap (Apple Silicon) vs btime-only dumb mode."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from functools import lru_cache
from pathlib import Path
from typing import Literal

from bright_vision_core.test_suite.timing import repo_root

CaptureMode = Literal["off", "bgpucap", "btime_only"]

_MODE_NOTE = {
    "off": "GPU capture disabled (SKIP_GPU or --skip-gpu).",
    "bgpucap": "Apple Silicon: bgpucap JSON metrics (GPU/CPU/RAM/pressure).",
    "btime_only": "btime wall-clock only; heartbeats use psutil/ioreg (no bgpucap on this host).",
}


def _machine_arm64() -> bool:
    machine = platform.machine().lower()
    return machine in ("arm64", "aarch64")


def host_supports_bgpucap() -> bool:
    """True when this machine can run bgpucap (macOS Apple Silicon)."""
    if os.environ.get("BV_FORCE_BGPUCAP") == "1":
        return True
    if sys.platform != "darwin" or not _machine_arm64():
        return False
    brand = platform.processor() or ""
    if brand and "Apple" not in brand and "apple" not in brand:
        # platform.processor() is often empty on macOS; sysctl is authoritative.
        try:
            out = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if out.returncode == 0 and "Apple" not in out.stdout:
                return False
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass
    return True


def gpu_capture_bin() -> str | None:
    """Prefer ``bgpucap``; fall back to legacy ``gpucap``."""
    override = os.environ.get("BV_GPUCAP_BIN", "").strip()
    if override and os.path.isfile(override) and os.access(override, os.X_OK):
        return override
    vendored = repo_root() / ".bright-vision" / "bin" / "bgpucap"
    if vendored.is_file() and os.access(vendored, os.X_OK):
        return str(vendored)
    for candidate in ("bgpucap", "gpucap"):
        path = shutil.which(candidate)
        if path:
            return path
    return None


def resolve_capture_mode(*, skip_gpu: bool = False) -> CaptureMode:
    if skip_gpu or os.environ.get("SKIP_GPU", "").strip() in ("1", "true", "yes"):
        return "off"
    if host_supports_bgpucap() and gpu_capture_bin():
        return "bgpucap"
    return "btime_only"


@lru_cache(maxsize=1)
def capture_mode_note(mode: CaptureMode) -> str:
    return _MODE_NOTE[mode]


def gpu_wrap_enabled(*, skip_gpu: bool = False) -> bool:
    return resolve_capture_mode(skip_gpu=skip_gpu) == "bgpucap"


def require_btime() -> bool:
    """Suite steps need wall-clock timing unless timing is explicitly skipped."""
    return shutil.which("btime") is not None
