"""Execute suite steps under bgpucap/gpucap + btime."""

from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from bright_vision_core.test_suite.cloud_preflight import cloud_llm_configured
from bright_vision_core.test_suite.router_preflight import router_lane_ready
from bright_vision_core.test_suite.manifest import (
    SuiteRunOptions,
    SuiteStep,
    llm_core_step_env,
    ollama_reachable,
    plan_steps,
)
from bright_vision_core.test_suite.resources import (
    UtilizationSample,
    format_util_suffix,
    sample_utilization,
)
from bright_vision_core.test_suite.capture_mode import (
    capture_mode_note,
    gpu_capture_bin,
    gpu_wrap_enabled,
    resolve_capture_mode,
)
from bright_vision_core.test_suite.gpucap_metrics import (
    capture_from_outputs,
    format_capture_summary,
    is_bgpucap_summary_json_line,
    maybe_compare_baseline,
    prefer_json_capture,
    save_baseline_json,
    should_emit_stderr_line,
    strip_ansi,
    wrap_step_argv,
)
from bright_vision_core.test_suite.timing import (
    record_step,
    record_total,
    repo_root,
)

_HEARTBEAT_INTERVAL_S = 20.0
_LLM_CORE_HEARTBEAT_INTERVAL_S = 10.0

EventCallback = Callable[[dict[str, Any]], None]


def build_step_env(
    step: SuiteStep,
    *,
    suite_run: bool = False,
    base: dict[str, str] | None = None,
) -> dict[str, str]:
    """Subprocess environment for one suite step (Test Lab + CLI)."""
    env = dict(base or os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    if suite_run:
        env["BV_TEST_SUITE_ACTIVE"] = "1"
    if step.id == "test-local:release" and suite_run:
        env["BV_TEST_SUITE_SMOKE_E2E"] = "1"
        env.pop("E2E_LLM", None)
        env.pop("E2E_SUPERPROJECT_LLM", None)
    if step.id == "llm:core" or step.requires_ollama:
        env.update(llm_core_step_env(suite_run=suite_run))
    if step.id == "e2e:llm:superproject":
        env["E2E_SUPERPROJECT_LLM"] = "1"
    if step.id == "e2e:llm:router":
        env["E2E_MODEL_ROUTER"] = "1"
        env["BV_ROUTER_LLM_E2E_ONLY"] = "1"
    if step.requires_cloud_config or step.id == "cloud-llm":
        env["E2E_CLOUD_LLM"] = "1"
    if step.id == "llm:core" and suite_run:
        env["BV_TEST_SUITE_LIVE_OUTPUT"] = "1"
        if os.environ.get("BV_SUITE_STRICT_PHASED_PYTEST") == "1":
            env["BV_SUITE_STRICT_PHASED_PYTEST"] = "1"
    return env


def _shutil_which(name: str) -> bool:
    return shutil.which(name) is not None


def _emit(cb: EventCallback | None, event: dict[str, Any]) -> None:
    if cb:
        cb(event)


def run_step(
    step: SuiteStep,
    *,
    cwd: Path,
    use_btime: bool = True,
    use_gpu: bool = True,
    use_brightdate: bool = False,
    on_event: EventCallback | None = None,
    cancel_check: Callable[[], bool] | None = None,
    suite_run: bool = False,
    suite_start: float | None = None,
    step_index: int = 0,
    total_steps: int = 0,
    sample_resources_on_heartbeat: bool = True,
) -> tuple[bool, float, float | None, float | None, str]:
    """Run one step. Returns ok, seconds, gpu_avg, gpu_peak, combined capture text."""
    env = build_step_env(step, suite_run=suite_run)

    if step.requires_ollama or step.id == "test-local:release":
        bits = [f"E2E_LLM={env.get('E2E_LLM', '(unset)')}"]
        if step.requires_ollama:
            bits.append(f"E2E_OLLAMA_MODEL={env.get('E2E_OLLAMA_MODEL', '')}")
            bits.append(f"BV_COMPACT_SPEC_GEN={env.get('BV_COMPACT_SPEC_GEN', '(unset)')}")
            bits.append(f"LLM_SPEC_GEN_TIMEOUT_S={env.get('LLM_SPEC_GEN_TIMEOUT_S', '')}")
            bits.append(f"E2E_SPEC_GEN_PHASED={env.get('E2E_SPEC_GEN_PHASED', '(unset)')}")
        if env.get("E2E_MODEL_ROUTER") == "1":
            bits.append("E2E_MODEL_ROUTER=1")
        if env.get("E2E_CLOUD_LLM") == "1":
            bits.append("E2E_CLOUD_LLM=1")
        if env.get("E2E_SUPERPROJECT_LLM"):
            bits.append(f"E2E_SUPERPROJECT_LLM={env['E2E_SUPERPROJECT_LLM']}")
        if step.id == "test-local:release":
            bits.append("BV_TEST_SUITE_SMOKE_E2E=1 (mocked e2e; *-llm.spec.ts excluded)")
        _emit(
            on_event,
            {
                "type": "step_line",
                "stepId": step.id,
                "stream": "stderr",
                "line": "suite env: " + ", ".join(bits),
            },
        )

    if step.touches_core_port:
        _emit(
            on_event,
            {
                "type": "core_port_warning",
                "text": (
                    "This step may restart Vision API on :8741. "
                    "Quit main BrightVision or accept chat interruption."
                ),
            },
        )

    _emit(on_event, {"type": "step_started", "stepId": step.id, "label": step.label})
    if step.id == "llm:core":
        _free_core_port_script = cwd / "scripts" / "free-core-port.sh"
        if _free_core_port_script.is_file():
            _emit(
                on_event,
                {
                    "type": "step_line",
                    "stepId": step.id,
                    "stream": "stderr",
                    "line": "Freeing :8741 after release tier (integration Vision API)",
                },
            )
            subprocess.run(
                ["sh", str(_free_core_port_script)],
                cwd=cwd,
                env=env,
                capture_output=True,
                text=True,
            )
        _warmup_script = cwd / "scripts" / "ollama-warmup-for-tests.sh"
        if _warmup_script.is_file() and not os.environ.get("SKIP_OLLAMA_WARMUP"):
            _emit(
                on_event,
                {
                    "type": "step_line",
                    "stepId": step.id,
                    "stream": "stderr",
                    "line": f"Warming Ollama model ({env.get('E2E_OLLAMA_MODEL', 'default')})",
                },
            )
            warm = subprocess.run(
                ["sh", str(_warmup_script)],
                cwd=cwd,
                env=env,
                capture_output=True,
                text=True,
                timeout=200,
            )
            if warm.stdout:
                for line in warm.stdout.splitlines():
                    _emit(
                        on_event,
                        {
                            "type": "step_line",
                            "stepId": step.id,
                            "stream": "stdout",
                            "line": line,
                        },
                    )
            if warm.stderr:
                for line in warm.stderr.splitlines():
                    _emit(
                        on_event,
                        {
                            "type": "step_line",
                            "stepId": step.id,
                            "stream": "stderr",
                            "line": line,
                        },
                    )
            if warm.returncode != 0:
                _emit(
                    on_event,
                    {
                        "type": "step_line",
                        "stepId": step.id,
                        "stream": "stderr",
                        "line": (
                            "Ollama warmup failed — LLM tests may retry for many minutes. "
                            "Check `ollama ps` and `ollama pull` for your E2E_OLLAMA_MODEL."
                        ),
                    },
                )
        _emit(
            on_event,
            {
                "type": "step_line",
                "stepId": step.id,
                "stream": "stdout",
                "line": (
                    f"pytest LLM suite (turn timeout {env.get('LLM_TEST_TURN_TIMEOUT_S')}s, "
                    f"agent {env.get('VISION_AGENT_PREPROC_TIMEOUT_S')}s); stderr shows START/PASS."
                ),
            },
        )

    capture_mode = resolve_capture_mode(skip_gpu=not use_gpu)
    gpu_bin = gpu_capture_bin() if capture_mode == "bgpucap" else None
    use_gpu = use_gpu and capture_mode == "bgpucap" and use_btime
    use_btime = use_btime and _shutil_which("btime")
    if use_btime and capture_mode == "btime_only":
        _emit(
            on_event,
            {
                "type": "step_line",
                "stepId": step.id,
                "stream": "stderr",
                "line": f"capture: {capture_mode_note('btime_only')}",
            },
        )

    ok = True
    combined = ""
    stderr_chunks: list[str] = []
    stdout_chunks: list[str] = []
    use_json = bool(use_gpu and prefer_json_capture())
    step_start = time.time()
    last_line_at = step_start
    last_heartbeat_at = step_start
    heartbeat_interval = (
        _LLM_CORE_HEARTBEAT_INTERVAL_S if step.id == "llm:core" else _HEARTBEAT_INTERVAL_S
    )
    live_gpu_samples: list[float] = []
    live_cpu_samples: list[float] = []

    def touch_output() -> None:
        nonlocal last_line_at
        last_line_at = time.time()

    def maybe_heartbeat() -> None:
        nonlocal last_heartbeat_at
        now = time.time()
        if now - last_line_at < heartbeat_interval:
            return
        if now - last_heartbeat_at < heartbeat_interval:
            return
        last_heartbeat_at = now
        step_elapsed = int(now - step_start)
        util = ""
        sample = UtilizationSample()
        if sample_resources_on_heartbeat:
            try:
                sample = sample_utilization()
                util = format_util_suffix(sample)
                if sample.gpu_pct is not None:
                    live_gpu_samples.append(sample.gpu_pct)
                if sample.cpu_pct is not None:
                    live_cpu_samples.append(sample.cpu_pct)
            except Exception:
                util = ""
        _emit(
            on_event,
            {
                "type": "step_line",
                "stepId": step.id,
                "stream": "stderr",
                "line": (
                    f"… still running ({step_elapsed}s this step{util}; "
                    "waiting for subprocess output)"
                ),
            },
        )
        if sample.gpu_pct is not None or sample.cpu_pct is not None:
            peak_gpu = max(live_gpu_samples) if live_gpu_samples else None
            avg_gpu = (
                sum(live_gpu_samples) / len(live_gpu_samples)
                if live_gpu_samples
                else None
            )
            _emit(
                on_event,
                {
                    "type": "step_util",
                    "stepId": step.id,
                    "cpuPct": sample.cpu_pct,
                    "gpuPct": sample.gpu_pct,
                    "gpuAvg": round(avg_gpu, 1) if avg_gpu is not None else None,
                    "gpuPeak": round(peak_gpu, 1) if peak_gpu is not None else None,
                },
            )
        if suite_start is not None and step_index > 0 and total_steps > 0:
            _emit(
                on_event,
                {
                    "type": "progress",
                    "stepIndex": step_index,
                    "totalSteps": total_steps,
                    "elapsedSeconds": now - suite_start,
                    "stepElapsedSeconds": now - step_start,
                    "stepId": step.id,
                },
            )

    def _emit_step_line(stream: str, raw_line: str) -> None:
        line = strip_ansi(raw_line.rstrip("\n")) if suite_run else raw_line.rstrip("\n")
        if not line.strip():
            return
        touch_output()
        _emit(
            on_event,
            {"type": "step_line", "stepId": step.id, "stream": stream, "line": line},
        )

    def drain_stdout() -> None:
        assert proc.stdout is not None
        for line in iter(proc.stdout.readline, ""):
            if cancel_check and cancel_check():
                return
            if use_json and is_bgpucap_summary_json_line(line):
                stdout_chunks.append(line)
                continue
            _emit_step_line("stdout", line)

    def drain_stderr() -> None:
        assert proc.stderr is not None
        for line in iter(proc.stderr.readline, ""):
            stderr_chunks.append(line)
            if line.startswith("GPUCAP\t"):
                continue
            if not should_emit_stderr_line(line):
                continue
            _emit_step_line("stderr", line)

    stdout_text = ""
    try:
        if use_btime and use_gpu and gpu_bin:
            cmd = wrap_step_argv(
                gpu_bin, step.argv, use_json=use_json, use_brightdate=use_brightdate
            )
        elif use_btime:
            from bright_vision_core.test_suite.brightdate_timing import btime_command_argv

            cmd = btime_command_argv(step.argv, use_brightdate=use_brightdate)
        else:
            cmd = list(step.argv)

        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        threads = [
            threading.Thread(target=drain_stdout, daemon=True),
            threading.Thread(target=drain_stderr, daemon=True),
        ]
        for t in threads:
            t.start()
        while any(t.is_alive() for t in threads):
            if cancel_check and cancel_check():
                proc.kill()
                ok = False
                break
            maybe_heartbeat()
            time.sleep(0.1)
        for t in threads:
            t.join(timeout=5)
        rc = proc.wait(timeout=30)
        if rc != 0:
            ok = False
        combined = "".join(stderr_chunks)
        stdout_text = "".join(stdout_chunks)
    except Exception as err:
        ok = False
        _emit(on_event, {"type": "step_line", "stepId": step.id, "stream": "stderr", "line": str(err)})
        combined = str(err)
        stdout_text = ""

    capture = (
        capture_from_outputs(
            stdout_text=stdout_text,
            stderr_text=combined,
            use_json=use_json and use_gpu,
        )
        if use_gpu
        else capture_from_outputs(stdout_text="", stderr_text=combined, use_json=False)
    )
    seconds = capture.elapsed_secs or 0.0
    gpu_avg, gpu_peak = capture.gpu_avg, capture.gpu_peak
    if live_gpu_samples:
        hb_avg = sum(live_gpu_samples) / len(live_gpu_samples)
        hb_peak = max(live_gpu_samples)
        if gpu_avg is None or gpu_avg <= 0:
            gpu_avg = round(hb_avg, 1)
            capture.gpu_avg = gpu_avg
        if gpu_peak is None or gpu_peak <= 0:
            gpu_peak = round(hb_peak, 1)
            capture.gpu_peak = gpu_peak

    if use_gpu and use_json and gpu_bin and stdout_text.strip():
        root = str(cwd)
        save_baseline_json(step.id, stdout_text, repo_root=root, ok=ok)

        def _compare_line(line: str) -> None:
            _emit(
                on_event,
                {
                    "type": "step_line",
                    "stepId": step.id,
                    "stream": "stderr",
                    "line": f"bgpucap compare: {line}",
                },
            )

        maybe_compare_baseline(
            gpu_bin,
            step.id,
            stdout_text,
            repo_root=root,
            on_line=_compare_line,
        )

    summary = format_capture_summary(capture, use_brightdate=use_brightdate)
    if summary:
        _emit(
            on_event,
            {
                "type": "step_line",
                "stepId": step.id,
                "stream": "stderr",
                "line": f"capture: {summary}",
            },
        )

    warning = None
    if seconds > 0:
        warning = record_step(
            step.id,
            seconds,
            ok,
            gpu_avg=gpu_avg,
            gpu_peak=gpu_peak,
            metrics=capture.to_history_fields(),
        )
    if warning:
        for line in warning.split("\n"):
            if line.strip():
                _emit(
                    on_event,
                    {"type": "step_line", "stepId": step.id, "stream": "stderr", "line": line},
                )

    finished: dict[str, Any] = {
        "type": "step_finished",
        "stepId": step.id,
        "label": step.label,
        "ok": ok,
        "seconds": seconds,
        "gpuAvg": gpu_avg,
        "gpuPeak": gpu_peak,
    }
    finished.update(capture.to_event_fields())
    _emit(on_event, finished)
    return ok, seconds, gpu_avg, gpu_peak, combined


def run_suite(
    *,
    skip_llm: bool = False,
    skip_gpu: bool = False,
    skip_time: bool = False,
    use_brightdate: bool = False,
    spec_gen_phased: bool = False,
    run_options: SuiteRunOptions | None = None,
    on_event: EventCallback | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> bool:
    """Run the full planned suite. Returns True if all steps passed."""
    os.environ.setdefault("BV_ROOT", str(repo_root()))
    os.environ["BV_TEST_SUITE_ACTIVE"] = "1"
    if use_brightdate:
        os.environ["BV_SUITE_USE_BRIGHTDATE"] = "1"
    else:
        os.environ.pop("BV_SUITE_USE_BRIGHTDATE", None)
    opts = run_options or SuiteRunOptions()
    if skip_llm:
        opts = SuiteRunOptions(
            skip_llm=True,
            spec_gen_phased=opts.spec_gen_phased or spec_gen_phased,
            llm_router=opts.llm_router,
            cloud_llm=opts.cloud_llm,
            verify_ears=opts.verify_ears,
            shipped_scenarios=opts.shipped_scenarios,
            strict_phased_pytest=opts.strict_phased_pytest,
        )
    elif spec_gen_phased:
        opts = SuiteRunOptions(
            skip_llm=opts.skip_llm,
            spec_gen_phased=True,
            llm_router=opts.llm_router,
            cloud_llm=opts.cloud_llm,
            verify_ears=opts.verify_ears,
            shipped_scenarios=opts.shipped_scenarios,
            strict_phased_pytest=opts.strict_phased_pytest,
        )
    if opts.spec_gen_phased or os.environ.get("E2E_SPEC_GEN_PHASED") == "1":
        os.environ["E2E_SPEC_GEN_PHASED"] = "1"
        os.environ["BV_SUITE_SPEC_GEN_PHASED"] = "1"
    if opts.strict_phased_pytest:
        os.environ["BV_SUITE_STRICT_PHASED_PYTEST"] = "1"
    if skip_gpu:
        os.environ["SKIP_GPU"] = "1"
    mode = resolve_capture_mode(skip_gpu=skip_gpu)
    cwd = repo_root()
    steps = plan_steps(skip_llm=skip_llm, options=opts)
    needs_ollama = any(s.requires_ollama for s in steps)
    if needs_ollama and not ollama_reachable() and os.environ.get("SKIP_LLM") != "1":
        _emit(
            on_event,
            {
                "type": "error",
                "text": (
                    "Ollama not reachable but this plan includes LLM steps "
                    "(start Ollama, enable Skip LLM tiers, or uncheck router/LLM lanes)"
                ),
            },
        )
        _emit(on_event, {"type": "run_finished", "ok": False, "totalSeconds": 0, "elapsedSeconds": 0})
        return False
    if any(s.id == "e2e:llm:router" for s in steps):
        ready, detail = router_lane_ready()
        if not ready:
            _emit(
                on_event,
                {"type": "error", "text": detail},
            )
            _emit(
                on_event,
                {"type": "run_finished", "ok": False, "totalSeconds": 0, "elapsedSeconds": 0},
            )
            return False
        _emit(
            on_event,
            {
                "type": "step_line",
                "stepId": "e2e:llm:router",
                "stream": "stderr",
                "line": f"router lane: {detail}",
            },
        )
    if any(s.requires_cloud_config for s in steps) and not cloud_llm_configured():
        _emit(
            on_event,
            {
                "type": "error",
                "text": (
                    "Cloud LLM lane selected but not configured — copy cloud-llm.env.example "
                    "to cloud-llm.env and set OPENAI_API_KEY (or Azure keys)"
                ),
            },
        )
        _emit(on_event, {"type": "run_finished", "ok": False, "totalSeconds": 0, "elapsedSeconds": 0})
        return False

    _emit(
        on_event,
        {
            "type": "run_started",
            "stepIds": [s.id for s in steps],
            "totalSteps": len(steps),
            "repoRoot": str(cwd),
            "captureMode": mode,
            "captureNote": capture_mode_note(mode),
            "useBrightDate": use_brightdate,
        },
    )
    if mode == "btime_only" and not skip_gpu:
        _emit(
            on_event,
            {
                "type": "step_line",
                "stepId": steps[0].id if steps else "",
                "stream": "stderr",
                "line": capture_mode_note("btime_only"),
            },
        )
    if not skip_time and not _shutil_which("btime"):
        _emit(
            on_event,
            {
                "type": "error",
                "text": "btime not on PATH — install Bright Utils btime or pass --skip-time",
            },
        )
        _emit(on_event, {"type": "run_finished", "ok": False, "totalSeconds": 0, "elapsedSeconds": 0})
        return False
    start = time.time()
    all_ok = True
    total_seconds = 0.0
    ran_ids: list[str] = []

    for idx, step in enumerate(steps, start=1):
        if cancel_check and cancel_check():
            all_ok = False
            break
        _emit(
            on_event,
            {
                "type": "progress",
                "stepIndex": idx,
                "totalSteps": len(steps),
                "elapsedSeconds": time.time() - start,
                "stepId": step.id,
            },
        )
        ok, secs, _, _, _ = run_step(
            step,
            cwd=cwd,
            use_btime=not skip_time and _shutil_which("btime"),
            use_gpu=gpu_wrap_enabled(skip_gpu=skip_gpu),
            use_brightdate=use_brightdate,
            on_event=on_event,
            cancel_check=cancel_check,
            suite_run=True,
            suite_start=start,
            step_index=idx,
            total_steps=len(steps),
            sample_resources_on_heartbeat=True,
        )
        if secs > 0:
            total_seconds += secs
        ran_ids.append(step.id)
        if not ok:
            all_ok = False

    if total_seconds > 0:
        record_total(total_seconds, all_ok, ran_ids)

    _emit(
        on_event,
        {
            "type": "run_finished",
            "ok": all_ok,
            "totalSeconds": total_seconds,
            "elapsedSeconds": time.time() - start,
        },
    )
    return all_ok
