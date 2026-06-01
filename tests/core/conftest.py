"""Make sibling modules (e.g. llm_ollama.py) importable in this directory."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_CORE_DIR = Path(__file__).resolve().parent
if str(_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(_CORE_DIR))


def _live_progress_stderr() -> bool:
    """Emit per-test lines for Test Lab / long LLM runs (works with ``-q``)."""
    return (
        os.environ.get("BV_TEST_SUITE_LIVE_OUTPUT") == "1"
        or os.environ.get("E2E_LLM") == "1"
    )


def pytest_runtest_logstart(nodeid: str, location: tuple[str, int, str]) -> None:
    if _live_progress_stderr():
        print(f"START {nodeid}", file=sys.stderr, flush=True)


def pytest_runtest_logreport(report) -> None:
    if not _live_progress_stderr():
        return
    if report.when == "call":
        dur = getattr(report, "duration", 0) or 0
        print(
            f"{report.outcome.upper()} {report.nodeid} ({dur:.1f}s)",
            file=sys.stderr,
            flush=True,
        )
        if report.failed and report.longrepr:
            text = str(report.longrepr)
            snippet = text if len(text) <= 2000 else text[:2000] + "\n…"
            print(f"FAIL: {snippet}", file=sys.stderr, flush=True)
