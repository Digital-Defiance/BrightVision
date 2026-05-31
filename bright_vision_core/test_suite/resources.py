"""Best-effort CPU/GPU samples for Test Lab heartbeats (no extra deps required)."""

from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class UtilizationSample:
    cpu_pct: float | None = None
    gpu_pct: float | None = None
    mem_pct: float | None = None


def _clamp_pct(v: float) -> float | None:
    if v != v or v < 0 or v > 100:  # NaN guard
        return None
    return v


def _parse_ioreg_gpu(blob: str) -> float | None:
    key = "Device Utilization %"
    for line in blob.splitlines():
        if key not in line:
            continue
        after = line.split(key, 1)[1]
        digits = ""
        for ch in after:
            if ch.isdigit() or ch == ".":
                digits += ch
            elif digits:
                break
        if digits:
            try:
                return _clamp_pct(float(digits))
            except ValueError:
                continue
    return None


def _sample_gpu() -> float | None:
    try:
        out = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=utilization.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if out.returncode == 0:
            for line in out.stdout.splitlines():
                line = line.strip()
                if line:
                    return _clamp_pct(float(line.split()[0]))
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError, OSError):
        pass
    if sys.platform == "darwin":
        try:
            out = subprocess.run(
                ["ioreg", "-r", "-d", "1", "-w", "0", "-c", "IOAccelerator"],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if out.returncode == 0:
                return _parse_ioreg_gpu(out.stdout)
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass
    return None


def _sample_cpu_psutil() -> float | None:
    try:
        import psutil  # type: ignore[import-untyped]

        return _clamp_pct(float(psutil.cpu_percent(interval=0.1)))
    except Exception:
        return None


def _sample_cpu_darwin_top() -> float | None:
    try:
        out = subprocess.run(
            ["top", "-l", "1", "-n", "0", "-s", "0"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if out.returncode != 0:
            return None
        m = re.search(
            r"CPU usage:\s*([\d.]+)% user,\s*([\d.]+)% sys",
            out.stdout,
        )
        if m:
            return _clamp_pct(float(m.group(1)) + float(m.group(2)))
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError, OSError):
        pass
    return None


def sample_utilization() -> UtilizationSample:
    """One-shot system utilization (may take ~0.1–1s on macOS)."""
    cpu = _sample_cpu_psutil()
    if cpu is None and sys.platform == "darwin":
        cpu = _sample_cpu_darwin_top()
    gpu = _sample_gpu()
    mem: float | None = None
    try:
        import psutil  # type: ignore[import-untyped]

        vm = psutil.virtual_memory()
        mem = _clamp_pct(float(vm.percent))
    except Exception:
        pass
    return UtilizationSample(cpu_pct=cpu, gpu_pct=gpu, mem_pct=mem)


def format_util_suffix(sample: UtilizationSample) -> str:
    parts: list[str] = []
    if sample.cpu_pct is not None:
        parts.append(f"CPU {sample.cpu_pct:.0f}%")
    if sample.gpu_pct is not None:
        parts.append(f"GPU {sample.gpu_pct:.0f}%")
    if sample.mem_pct is not None:
        parts.append(f"RAM {sample.mem_pct:.0f}%")
    return f" · {' · '.join(parts)}" if parts else ""
