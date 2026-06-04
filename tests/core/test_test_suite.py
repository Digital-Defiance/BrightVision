"""Unit tests for test_suite manifest and timing helpers."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from bright_vision_core.test_suite.manifest import (
    SuiteRunOptions,
    SuiteStep,
    llm_core_pytest_argv,
    plan_steps,
)
from bright_vision_core.test_suite.capture_mode import gpu_capture_bin
from bright_vision_core.test_suite.runner import build_step_env, _LLM_GPU_STALL_ABORT_ENABLED
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


def test_build_step_env_release_smoke_unsets_e2e_llm(tmp_path: Path):
    step = SuiteStep(
        "test-local:release",
        "release",
        ("sh", "scripts/test-local.sh", "release"),
        touches_core_port=True,
    )
    venv_bin = tmp_path / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    venv_py = venv_bin / "python3"
    venv_py.write_text("#!/bin/sh\n", encoding="utf8")
    venv_py.chmod(0o755)
    env = build_step_env(step, suite_run=True, base={"E2E_LLM": "1"}, cwd=tmp_path)
    assert env.get("E2E_LLM") is None
    assert env["BV_TEST_SUITE_SMOKE_E2E"] == "1"
    assert env["BV_TEST_SUITE_ACTIVE"] == "1"
    assert env["E2E_PYTHON"] == str(venv_py.resolve())
    assert env["PATH"].split(":")[0] == str(venv_bin.resolve())


def test_gpu_capture_bin_prefers_bgpucap(monkeypatch):
    def which(name: str) -> str | None:
        if name == "bgpucap":
            return "/usr/local/bin/bgpucap"
        if name == "gpucap":
            return "/usr/local/bin/gpucap"
        return None

    monkeypatch.setattr("bright_vision_core.test_suite.capture_mode.shutil.which", which)
    assert gpu_capture_bin() == "/usr/local/bin/bgpucap"


def test_gpu_capture_bin_falls_back_to_gpucap(monkeypatch):
    monkeypatch.setattr(
        "bright_vision_core.test_suite.capture_mode.shutil.which",
        lambda name: "/usr/local/bin/gpucap" if name == "gpucap" else None,
    )
    assert gpu_capture_bin() == "/usr/local/bin/gpucap"


def test_llm_core_step_env_longer_timeouts_in_suite(monkeypatch):
    from bright_vision_core.test_suite.manifest import llm_core_step_env

    monkeypatch.setenv("LLM_TEST_TURN_TIMEOUT_S", "300")
    env = llm_core_step_env(suite_run=True)
    assert env["LLM_TEST_TURN_TIMEOUT_S"] == "1200"
    assert env["VISION_AGENT_PREPROC_TIMEOUT_S"] == "0"
    assert env["OLLAMA_WARMUP_EXCLUSIVE"] == "1"
    assert env["BV_COMPACT_SPEC_GEN"] == "1"
    assert env["LLM_SPEC_GEN_TURN_TIMEOUT_S"] == "1800"
    assert env["LLM_SPEC_GEN_TIMEOUT_S"] == "1800"


def test_llm_core_step_env_pins_default_model_in_suite(monkeypatch):
    from bright_vision_core.test_suite.manifest import llm_core_step_env

    monkeypatch.setenv("E2E_OLLAMA_MODEL", "ollama_chat/qwen3.6:27b-q4_K_M")
    env = llm_core_step_env(suite_run=True)
    assert env["E2E_OLLAMA_MODEL"] == "ollama_chat/llama3.2:3b"


def test_llm_core_step_env_uses_env_model_when_flag_set(monkeypatch):
    from bright_vision_core.test_suite.manifest import llm_core_step_env

    monkeypatch.setenv("BV_SUITE_USE_ENV_MODEL", "1")
    monkeypatch.setenv("E2E_OLLAMA_MODEL", "ollama_chat/qwen3.6:27b-q4_K_M")
    env = llm_core_step_env(suite_run=True)
    assert env["E2E_OLLAMA_MODEL"] == "ollama_chat/qwen3.6:27b-q4_K_M"


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


def test_plan_steps_optional_lanes():
    opts = SuiteRunOptions(
        skip_llm=True,
        cloud_llm=True,
        verify_ears=True,
        shipped_scenarios=True,
    )
    ids = [s.id for s in plan_steps(skip_llm=True, options=opts)]
    assert "cloud-llm" in ids
    assert "verify:ears" in ids
    assert "e2e:shipped-scenarios" in ids
    assert "e2e:llm:router" not in ids


def test_router_lane_ready_requires_distinct_tags(monkeypatch, tmp_path):
    from bright_vision_core.test_suite import router_preflight as rp

    env_file = tmp_path / "local-llm.env"
    env_file.write_text("FAST_MODEL=qwen2.5-coder:7b\nHEAVY_MODEL=llama3.2:3b\n", encoding="utf-8")
    monkeypatch.setattr(rp, "repo_root", lambda: tmp_path)
    monkeypatch.delenv("E2E_FAST_MODEL", raising=False)
    monkeypatch.delenv("E2E_HEAVY_MODEL", raising=False)
    monkeypatch.delenv("FAST_MODEL", raising=False)
    monkeypatch.delenv("HEAVY_MODEL", raising=False)
    ok, _ = rp.router_lane_ready()
    assert ok is True


def test_router_lane_ready_rejects_missing_fast(monkeypatch, tmp_path):
    from bright_vision_core.test_suite import router_preflight as rp

    monkeypatch.setattr(rp, "repo_root", lambda: tmp_path)
    monkeypatch.delenv("E2E_FAST_MODEL", raising=False)
    monkeypatch.delenv("FAST_MODEL", raising=False)
    ok, msg = rp.router_lane_ready()
    assert ok is False
    assert "FAST_MODEL" in msg


def test_build_step_env_router_and_cloud():
    router = SuiteStep(
        "e2e:llm:router",
        "router",
        ("yarn", "test:e2e:llm:router"),
        requires_ollama=True,
    )
    cloud = SuiteStep(
        "cloud-llm",
        "cloud",
        ("yarn", "test:cloud-llm"),
        requires_cloud_config=True,
    )
    assert build_step_env(router, suite_run=True)["E2E_MODEL_ROUTER"] == "1"
    assert build_step_env(cloud, suite_run=True)["E2E_CLOUD_LLM"] == "1"


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
    assert run.cancelled() is True
    hold.set()
    worker.join(timeout=2.0)
    job_store.reconcile_active()
    assert job_store.active_run() is None


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


def test_run_suite_fail_fast_stops_after_first_failure(monkeypatch):
    from bright_vision_core.test_suite import runner as runner_mod

    steps = [
        SuiteStep("a", "step a", ("true",)),
        SuiteStep("b", "step b", ("true",)),
        SuiteStep("c", "step c", ("true",)),
    ]
    calls: list[str] = []
    events: list[dict] = []

    monkeypatch.setattr(runner_mod, "plan_steps", lambda **_: steps)
    monkeypatch.setattr(runner_mod, "_shutil_which", lambda _: True)
    monkeypatch.setattr(runner_mod, "resolve_capture_mode", lambda **_: "off")
    monkeypatch.setattr(runner_mod, "gpu_wrap_enabled", lambda **_: False)
    monkeypatch.setattr(runner_mod, "record_total", lambda *a, **k: None)
    monkeypatch.setattr(runner_mod, "record_step", lambda *a, **k: None)

    def fake_run_step(step, **kwargs):
        calls.append(step.id)
        return step.id != "b", 1.0, None, None, ""

    monkeypatch.setattr(runner_mod, "run_step", fake_run_step)

    ok = runner_mod.run_suite(
        skip_llm=True,
        skip_gpu=True,
        skip_time=True,
        fail_fast=True,
        on_event=events.append,
    )
    assert ok is False
    assert calls == ["a", "b"]
    finished = [e for e in events if e.get("type") == "run_finished"][-1]
    assert finished["failFast"] is True
    assert finished["skippedStepIds"] == ["c"]


def test_run_suite_start_from_step_id(monkeypatch):
    from bright_vision_core.test_suite import runner as runner_mod

    steps = [
        SuiteStep("a", "step a", ("true",)),
        SuiteStep("b", "step b", ("true",)),
        SuiteStep("c", "step c", ("true",)),
    ]
    calls: list[str] = []
    events: list[dict] = []

    monkeypatch.setattr(runner_mod, "plan_steps", lambda **_: steps)
    monkeypatch.setattr(runner_mod, "_shutil_which", lambda _: True)
    monkeypatch.setattr(runner_mod, "resolve_capture_mode", lambda **_: "off")
    monkeypatch.setattr(runner_mod, "gpu_wrap_enabled", lambda **_: False)
    monkeypatch.setattr(runner_mod, "record_total", lambda *a, **k: None)
    monkeypatch.setattr(runner_mod, "record_step", lambda *a, **k: None)

    def fake_run_step(step, **kwargs):
        calls.append(step.id)
        return True, 1.0, None, None, ""

    monkeypatch.setattr(runner_mod, "run_step", fake_run_step)

    ok = runner_mod.run_suite(
        skip_llm=True,
        skip_gpu=True,
        skip_time=True,
        start_from_step_id="b",
        on_event=events.append,
    )
    assert ok is True
    assert calls == ["b", "c"]
    skipped = [e for e in events if e.get("type") == "step_skipped"]
    assert len(skipped) == 1
    assert skipped[0]["stepId"] == "a"
    started = [e for e in events if e.get("type") == "run_started"][-1]
    assert started["startFromStepId"] == "b"
    assert started["skippedStepIds"] == ["a"]


def test_gpu_baseline_for_step(tmp_path, monkeypatch):
    from bright_vision_core.test_suite.timing import gpu_baseline_for_step, record_step

    hist = tmp_path / "timing.json"
    monkeypatch.setenv("TEST_EVERYTHING_TIMING_FILE", str(hist))
    record_step("llm:core", 100.0, True, gpu_avg=40.0, gpu_peak=80.0)
    record_step("llm:core", 110.0, True, gpu_avg=50.0, gpu_peak=90.0)
    baseline = gpu_baseline_for_step("llm:core")
    assert baseline["sampleCount"] == 2
    assert baseline["medianGpuPeak"] == 85.0


def test_line_indicates_test_fail():
    from bright_vision_core.test_suite.runner import _line_indicates_test_fail

    assert _line_indicates_test_fail("FAILED tests/core/test_foo.py::test_bar")
    assert _line_indicates_test_fail("  ✘  3 e2e/foo.spec.ts:1:1 › title")
    assert not _line_indicates_test_fail("[ FAIL ] yarn test:llm:core")
    assert not _line_indicates_test_fail("FAIL: tests/core/test_foo.py:12: in test_bar")
    assert not _line_indicates_test_fail("Test Files  1 failed (53)")
    assert not _line_indicates_test_fail("PASS: ok")


def test_gpu_stall_abort_enabled_by_default():
    assert _LLM_GPU_STALL_ABORT_ENABLED is True


def test_gpu_stall_abort_can_disable(monkeypatch):
    monkeypatch.setenv("BV_LLM_GPU_STALL_ABORT", "0")
    import importlib
    import bright_vision_core.test_suite.runner as runner_mod

    importlib.reload(runner_mod)
    assert runner_mod._LLM_GPU_STALL_ABORT_ENABLED is False
    importlib.reload(runner_mod)
