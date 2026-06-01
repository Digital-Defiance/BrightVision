"""Unit tests for bgpucap JSON + legacy capture parsing."""

from __future__ import annotations

import json

from bright_vision_core.test_suite.gpucap_metrics import (
    capture_from_outputs,
    format_capture_summary,
    is_bgpucap_summary_json_line,
    parse_bgpucap_json,
    pressure_label,
    strip_ansi,
    wrap_step_argv,
)


SAMPLE_JSON = json.dumps(
    {
        "command": "pytest",
        "exit_code": 0,
        "elapsed_secs": 42.5,
        "chip": {"brand": "Apple M4 Max", "family": "m4"},
        "metrics": {
            "gpu": {"avg": 10.0, "peak": 55.0, "samples": 100},
            "cpu": {"avg": 8.0, "peak": 22.0, "samples": 100},
            "memory": {"avg": 51.0, "peak": 68.0, "samples": 100},
            "mem_pressure": {"avg": 1.0, "peak": 2.0, "samples": 100},
            "mem_swap": {"avg": 0.0, "peak": 1073741824.0, "samples": 100},
        },
    }
)


def test_parse_bgpucap_json():
    cap = parse_bgpucap_json(SAMPLE_JSON)
    assert cap is not None
    assert cap.gpu_avg == 10.0
    assert cap.gpu_peak == 55.0
    assert cap.mem_pressure_peak == 2.0
    assert cap.elapsed_secs == 42.5
    assert cap.chip_brand == "Apple M4 Max"


def test_capture_from_outputs_json():
    cap = capture_from_outputs(stdout_text=SAMPLE_JSON, stderr_text="", use_json=True)
    assert cap.json_mode is True
    assert cap.gpu_peak == 55.0


def test_capture_from_outputs_legacy():
    stderr = "real     0.000003601 days  (1.5 s)\nGPUCAP\t12.0\t40.0\t5.0\t10.0\t60.0\t70.0\n"
    cap = capture_from_outputs(stdout_text="", stderr_text=stderr, use_json=False)
    assert cap.gpu_avg == 12.0
    assert cap.gpu_peak == 40.0
    assert cap.mem_avg == 60.0
    assert cap.mem_peak == 70.0


def test_wrap_step_argv_json():
    argv = wrap_step_argv("/usr/local/bin/bgpucap", ("yarn", "test"), use_json=True)
    assert argv[0] == "/usr/local/bin/bgpucap"
    assert "-f" in argv and "json" in argv
    assert "btime" in argv
    metrics = argv[argv.index("--metrics") + 1]
    assert "memory-detail" in metrics
    assert "mem-detail" not in metrics


def test_is_bgpucap_summary_json_line():
    assert is_bgpucap_summary_json_line('{"schema":"1","kind":"run","metrics":{}}\n')
    assert not is_bgpucap_summary_json_line("Running 8 tests using 1 worker\n")
    assert not is_bgpucap_summary_json_line('{"foo":1}\n')


def test_strip_ansi():
    raw = "\x1b[33mhello\x1b[39m"
    assert strip_ansi(raw) == "hello"


def test_suite_metrics_accepted_by_bgpucap():
    """Guard against typo metric group names (e.g. mem-detail vs memory-detail)."""
    import shutil
    import subprocess

    from bright_vision_core.test_suite.gpucap_metrics import _SUITE_METRICS

    bgpucap = shutil.which("bgpucap") or shutil.which("gpucap")
    if not bgpucap:
        return
    proc = subprocess.run(
        [bgpucap, "-f", "json", "--metrics", _SUITE_METRICS, "sleep", "0.05"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert proc.returncode == 0, (proc.stderr or proc.stdout)[:500]
    assert '"schema":"1"' in (proc.stdout or "").replace(" ", "")


def test_pressure_label_and_summary():
    assert pressure_label(2.0) == "critical"
    cap = parse_bgpucap_json(SAMPLE_JSON)
    assert cap is not None
    text = format_capture_summary(cap)
    assert "pressure" in text
    assert "GPU" in text
