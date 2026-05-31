"""Unit tests for test_suite manifest and timing helpers."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from bright_vision_core.test_suite.manifest import (
    SuiteStep,
    llm_core_pytest_argv,
    plan_steps,
)
from bright_vision_core.test_suite.runner import build_step_env, gpu_capture_bin
from bright_vision_core.test_suite.timing import (
    GPUCAP_FMT,
    expectations_for_steps,
    parse_btime_seconds,
    parse_gpucap_line,
    record_step,
)


def test_parse_btime_seconds():
    text = "real     0.000003601 days  (0.311140 s)\n"
    assert parse_btime_seconds(text) == 0.311140


def test_parse_gpucap_line():
    text = "noise\nGPUCAP\t12.3\t45.6\t1\t2\t3\t4\n"
    assert parse_gpucap_line(text) == (12.3, 45.6)


def test_gpucap_fmt_has_sentinel():
    assert "GPUCAP" in GPUCAP_FMT and "%gA" in GPUCAP_FMT


def test_build_step_env_llm_lane_sets_e2e_llm():
    step = SuiteStep("e2e:llm", "e2e", ("yarn", "test:e2e:llm"), requires_ollama=True)
    env = build_step_env(step, suite_run=True, base={})
    assert env["E2E_LLM"] == "1"
    assert env["BV_TEST_SUITE_ACTIVE"] == "1"
    assert "E2E_OLLAMA_MODEL" in env


def test_build_step_env_release_smoke_unsets_e2e_llm():
    step = SuiteStep(
        "test-local:release",
        "release",
        ("sh", "scripts/test-local.sh", "release"),
        touches_core_port=True,
    )
    env = build_step_env(step, suite_run=True, base={"E2E_LLM": "1"})
    assert env.get("E2E_LLM") is None
    assert env["BV_TEST_SUITE_SMOKE_E2E"] == "1"
    assert env["BV_TEST_SUITE_ACTIVE"] == "1"


def test_gpu_capture_bin_prefers_bcpucap(monkeypatch):
    def which(name: str) -> str | None:
        if name == "bcpucap":
            return "/usr/local/bin/bcpucap"
        if name == "gpucap":
            return "/usr/local/bin/gpucap"
        return None

    monkeypatch.setattr("bright_vision_core.test_suite.runner.shutil.which", which)
    assert gpu_capture_bin() == "bcpucap"


def test_gpu_capture_bin_falls_back_to_gpucap(monkeypatch):
    monkeypatch.setattr(
        "bright_vision_core.test_suite.runner.shutil.which",
        lambda name: "/usr/local/bin/gpucap" if name == "gpucap" else None,
    )
    assert gpu_capture_bin() == "gpucap"


def test_llm_core_step_env_longer_timeouts_in_suite(monkeypatch):
    from bright_vision_core.test_suite.manifest import llm_core_step_env

    monkeypatch.setenv("LLM_TEST_TURN_TIMEOUT_S", "300")
    env = llm_core_step_env(suite_run=True)
    assert env["LLM_TEST_TURN_TIMEOUT_S"] == "1200"
    assert env["VISION_AGENT_PREPROC_TIMEOUT_S"] == "0"
    assert env["LLM_SPEC_GEN_TURN_TIMEOUT_S"] == "1200"


def test_llm_core_step_env_respects_explicit_timeout_override(monkeypatch):
    from bright_vision_core.test_suite.manifest import llm_core_step_env

    monkeypatch.setenv("BV_SUITE_USE_ENV_TIMEOUTS", "1")
    monkeypatch.setenv("LLM_TEST_TURN_TIMEOUT_S", "1200")
    env = llm_core_step_env(suite_run=True)
    assert env["LLM_TEST_TURN_TIMEOUT_S"] == "1200"


def test_llm_core_argv_uses_live_pytest():
    argv = llm_core_pytest_argv()
    assert argv[0] == ".venv/bin/python3"
    assert "-m" in argv and "pytest" in argv
    assert "-v" in argv
    assert "-s" in argv
    assert "-q" not in argv


def test_plan_steps_includes_base():
    steps = plan_steps(skip_llm=True)
    ids = [s.id for s in steps]
    assert "dogfood:check" in ids
    assert "test-local:release" in ids
    assert "llm:core" not in ids


def test_expectations_empty_history(tmp_path, monkeypatch):
    hist = tmp_path / "timing.json"
    monkeypatch.setenv("TEST_EVERYTHING_TIMING_FILE", str(hist))
    exp = expectations_for_steps(["dogfood:check"])
    assert exp["haveAllMedians"] is False
    assert "dogfood:check" in exp["missingMedians"]


def test_record_step_writes_history(tmp_path, monkeypatch):
    hist = tmp_path / "timing.json"
    monkeypatch.setenv("TEST_EVERYTHING_TIMING_FILE", str(hist))
    record_step("dogfood:check", 10.0, True, gpu_avg=1.0, gpu_peak=2.0)
    data = json.loads(hist.read_text())
    runs = data["steps"]["dogfood:check"]["runs"]
    assert len(runs) == 1
    assert runs[0]["gpu_avg"] == 1.0


def test_suite_step_frozen():
    s = SuiteStep("a", "label", ("echo", "hi"))
    assert s.argv == ("echo", "hi")


def test_default_orchestrator_port():
    from bright_vision_core.test_suite.ports import DEFAULT_ORCHESTRATOR_PORT, orchestrator_port

    assert DEFAULT_ORCHESTRATOR_PORT == 8743
    assert orchestrator_port() == 8743


def test_transcript_format_step_line():
    from bright_vision_core.test_suite.transcript import format_event_line

    assert format_event_line({"type": "step_line", "line": "ok"}) == "ok"
    assert (
        format_event_line({"type": "step_line", "stream": "stderr", "line": "warn"})
        == "[stderr] warn"
    )


def test_transcript_writer_roundtrip(tmp_path, monkeypatch):
    from bright_vision_core.test_suite.transcript import TranscriptWriter

    log = tmp_path / "suite.log"
    monkeypatch.setenv("TEST_EVERYTHING_TIMING_FILE", str(tmp_path / "timing.json"))
    w = TranscriptWriter(log)
    w.write_event({"type": "step_started", "label": "yarn test"})
    w.write_event({"type": "step_line", "line": "hello"})
    w.close()
    text = log.read_text()
    assert "yarn test" in text
    assert "hello" in text


def test_health_advertises_runs_enabled():
    from fastapi.testclient import TestClient

    from bright_vision_core.test_suite.http import app

    res = TestClient(app).get("/health")
    assert res.status_code == 200
    assert res.json()["runsEnabled"] is True
    assert res.json()["cancelActiveRoute"] is True


def test_http_cancel_active_route_not_shadowed_by_run_id():
    import threading

    from fastapi.testclient import TestClient

    from bright_vision_core.test_suite import http as http_mod
    from bright_vision_core.test_suite.jobs import TestSuiteRun, job_store

    hold = threading.Event()
    worker = threading.Thread(target=hold.wait, daemon=True)
    worker.start()
    run = TestSuiteRun(run_id="real-run-uuid")
    run.status = "running"
    run._thread = worker
    with job_store._lock:
        job_store._runs[run.run_id] = run
        job_store._active_id = run.run_id

    client = TestClient(http_mod.app)
    res = client.post("/test-suite/runs/active/cancel")
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True
    assert job_store.active_run() is None
    hold.set()


def test_reconcile_clears_dead_active_run():
    from bright_vision_core.test_suite.jobs import TestSuiteJobStore, TestSuiteRun

    store = TestSuiteJobStore()
    run = TestSuiteRun(run_id="dead")
    run.status = "running"
    run._thread = None
    with store._lock:
        store._runs[run.run_id] = run
        store._active_id = run.run_id
    store.reconcile_active()
    assert store.active_run() is None
    assert store._runs[run.run_id].status == "error"


def test_http_start_run_not_blocked_by_orchestrator_flag(monkeypatch):
    """Test Lab spawns the orchestrator; POST /runs must work (no 403)."""
    from fastapi.testclient import TestClient

    from bright_vision_core.test_suite import http as http_mod

    class _FakeRun:
        run_id = "fake-run-id"
        transcript_path = None

    monkeypatch.setenv("BV_TEST_ORCHESTRATOR_ACTIVE", "1")
    monkeypatch.setattr(http_mod.job_store, "start", lambda **_: _FakeRun())
    client = TestClient(http_mod.app)
    res = client.post("/test-suite/runs", json={"skip_llm": True, "skip_gpu": True})
    assert res.status_code == 200
    assert res.json()["run_id"] == "fake-run-id"
