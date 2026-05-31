"""Test-suite orchestrator port (Test Lab / ``bright-vision-test-suite-serve``)."""

from __future__ import annotations

import os

# :8742 is BrightVision LAN remote proxy → core :8741; orchestrator uses :8743.
DEFAULT_ORCHESTRATOR_PORT = 8743


def orchestrator_port() -> int:
    raw = os.environ.get("BV_TEST_ORCHESTRATOR_PORT", str(DEFAULT_ORCHESTRATOR_PORT))
    return int(raw)
