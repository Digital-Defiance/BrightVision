"""Full-suite transcript files for Test Lab and CLI ``--logged``."""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bright_vision_core.test_suite.timing import repo_root


def transcript_runs_dir() -> Path:
    return repo_root() / ".bright-vision" / "test-suite-runs"


def resolve_transcript_path(
    *,
    run_id: str | None = None,
    override: str | None = None,
) -> Path:
    if override:
        path = Path(override)
        if not path.is_absolute():
            path = repo_root() / path
        return path
    legacy = os.environ.get("TEST_EVERYTHING_LOG")
    if legacy:
        path = Path(legacy)
        if not path.is_absolute():
            path = repo_root() / path
        return path
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    suffix = (run_id or "cli")[:8]
    return transcript_runs_dir() / f"run-{ts}-{suffix}.log"


def format_event_line(event: dict[str, Any]) -> str | None:
    t = event.get("type")
    if t == "run_started":
        lines = [
            f"=== run started {datetime.now(timezone.utc).isoformat()} ===",
            f"repo: {event.get('repoRoot', '')}",
            f"steps: {', '.join(event.get('stepIds') or [])}",
            "",
        ]
        return "\n".join(lines)
    if t == "step_started":
        return f"\n> {event.get('label', event.get('stepId', ''))}\n{'-' * 80}"
    if t == "step_line":
        stream = event.get("stream", "stdout")
        line = event.get("line", "")
        if stream == "stderr":
            return f"[stderr] {line}"
        return str(line)
    if t == "step_finished":
        mark = "SUCCESS" if event.get("ok") else "FAIL"
        parts = [f"[ {mark} ] {event.get('label', event.get('stepId', ''))}"]
        if event.get("seconds") is not None:
            parts.append(f"  time: {event['seconds']:.3f}s")
        if event.get("gpuAvg") is not None:
            parts.append(
                f"  gpu: avg {event['gpuAvg']}% peak {event.get('gpuPeak', '?')}%"
            )
        return "\n".join(parts)
    if t == "run_finished":
        mark = "ALL TEST SUITES SUCCESSFUL" if event.get("ok") else "RUN FAILED"
        return (
            f"\n=== run finished {mark} "
            f"(total {event.get('totalSeconds', 0):.1f}s, "
            f"elapsed {event.get('elapsedSeconds', 0):.1f}s) ===\n"
        )
    if t == "error":
        return f"[error] {event.get('text', '')}"
    if t == "core_port_warning":
        return f"[warning] {event.get('text', '')}"
    if t == "progress":
        return None
    if t == "transcript_saved":
        return None
    if t == "done":
        return None
    return None


class TranscriptWriter:
    """Append formatted suite events to a log file (line-buffered, flushed)."""

    def __init__(self, path: Path) -> None:
        self.path = path.resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._file = self.path.open("w", encoding="utf-8")
        self._file.write(f"# BrightVision test suite transcript\n# {self.path}\n\n")
        self._file.flush()

    def write_event(self, event: dict[str, Any]) -> None:
        block = format_event_line(event)
        if not block:
            return
        with self._lock:
            self._file.write(block)
            if not block.endswith("\n"):
                self._file.write("\n")
            self._file.flush()

    def close(self) -> None:
        with self._lock:
            self._file.close()
