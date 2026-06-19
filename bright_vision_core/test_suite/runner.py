"""Execute suite steps under bgpucap/gpucap + btime."""

from __future__ import annotations

import os
import re
import shutil
import signal
import subprocess
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from bright_vision_core.test_suite.cloud_preflight import cloud_llm_configured
from bright_vision_core.test_suite.router_preflight import router_lane_ready
from bright_vision_core.test_suite.local_llm import (
    local_llm_reachable,
    resolve_backend,
    router_lane_step_env,
)
from bright_vision_core.test_suite.manifest import (
    SuiteRunOptions,
    SuiteStep,
    llm_core_step_env,
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
    format_duration,
    gpu_baseline_for_step,
    record_step,
    record_total,
    repo_root,
)

_HEARTBEAT_INTERVAL_S = 45.0
_LLM_CORE_HEARTBEAT_INTERVAL_S = 30.0
_UTIL_EMIT_INTERVAL_S = 30.0
_LLM_GPU_STALL_ABORT_S = float(os.environ.get("BV_LLM_GPU_STALL_ABORT_S", "240"))
_LLM_GPU_LOW_WARN_S = float(os.environ.get("BV_LLM_GPU_LOW_WARN_S", "120"))
# LM Studio on macOS often reports 0% GPU via ioreg while CPU is busy — treat as active.
_LLM_CPU_STALL_ACTIVITY_PCT = float(os.environ.get("BV_LLM_CPU_STALL_ACTIVITY_PCT", "12"))
_LLM_GPU_STALL_ABORT_ENABLED = os.environ.get("BV_LLM_GPU_STALL_ABORT", "1").strip().lower() not in (
    "0",
    "false",
    "no",
    "off",
)


def _suite_turn_timeout_s(step_env: dict[str, str]) -> float:
    try:
        return float(step_env.get("BV_SUITE_LLM_TURN_TIMEOUT_S", "300"))
    except (TypeError, ValueError):
        return 300.0


def resolve_gpu_stall_abort_s(step_env: dict[str, str] | None = None) -> float:
    """Read stall cap from the step subprocess env (not import-time os.environ)."""
    bag = step_env or os.environ
    raw = bag.get("BV_LLM_GPU_STALL_ABORT_S", "240")
    try:
        base = float(raw)
    except (TypeError, ValueError):
        base = 240.0
    if bag.get("BV_TEST_SUITE_ACTIVE") == "1" or step_env is not None:
        turn = _suite_turn_timeout_s(bag)
        return max(base, turn + 90.0)
    return base


def should_gpu_stall_abort(
    *,
    step: SuiteStep,
    step_env: dict[str, str],
    use_gpu: bool,
    step_elapsed_s: float,
    gpu_idle_s: float,
    cpu_idle_s: float | None = None,
    sse_wait_started_at: float | None,
) -> tuple[bool, float]:
    stall_s = resolve_gpu_stall_abort_s(step_env)
    if not _LLM_GPU_STALL_ABORT_ENABLED or not step.requires_ollama or not use_gpu:
        return False, stall_s
    if step_elapsed_s < stall_s or gpu_idle_s < stall_s:
        return False, stall_s
    if cpu_idle_s is not None and cpu_idle_s < stall_s:
        # CPU busy with flat GPU — common for LM Studio / small models on Apple Silicon.
        return False, stall_s
    if sse_wait_started_at is not None and step.id == "llm:core":
        turn_s = _suite_turn_timeout_s(step_env)
        # Let pytest hit SSE timeout + recover retry before the suite kills llm:core.
        if (time.time() - sse_wait_started_at) < (turn_s * 2.0 + 120.0):
            return False, stall_s
    if step.id == "e2e:llm" and step_elapsed_s < stall_s * 2.0:
        # Playwright LLM lane runs long /agent implement + spec-gen files serially.
        return False, stall_s
    return True, stall_s
_TEST_FAIL_LINE_RES = [
    re.compile(r"^FAILED\s+\S", re.I),
    re.compile(r"::\S+\s+FAILED\b", re.I),  # pytest -v stdout
    re.compile(r"^\s*✘\s+\d+\s+\S+\.(?:spec|test)\.", re.I),
    re.compile(r"^\s*×\s+\d+\s+\S+\.(?:spec|test)\.", re.I),
]
# Pytest / llm_client heartbeats — must not reset GPU stall idle timers.
_STDERR_IDLE_HEARTBEAT_MARKERS = (
    "waiting for SSE",
    "still running (",
)


def _stderr_line_counts_as_progress(line: str) -> bool:
    return not any(m in line for m in _STDERR_IDLE_HEARTBEAT_MARKERS)


def _line_indicates_test_fail(line: str) -> bool:
    stripped = line.strip()
    if not stripped or stripped.startswith("FAIL:"):
        return False
    return any(p.search(stripped) for p in _TEST_FAIL_LINE_RES)


def _terminate_step_process(proc: subprocess.Popen[str] | None) -> None:
    """Stop step subprocess and its children (e.g. Playwright under yarn/sh)."""
    if proc is None or proc.poll() is not None:
        return
    try:
        if os.name != "nt":
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        else:
            proc.kill()
    except ProcessLookupError:
        pass
    except OSError:
        proc.kill()


EventCallback = Callable[[dict[str, Any]], None]


def build_step_env(
    step: SuiteStep,
    *,
    suite_run: bool = False,
    base: dict[str, str] | None = None,
    cwd: Path | None = None,
) -> dict[str, str]:
    """Subprocess environment for one suite step (Test Lab + CLI)."""
    env = dict(base or os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    if suite_run:
        env["BV_TEST_SUITE_ACTIVE"] = "1"
    root = cwd or repo_root()
    venv_py = root / ".venv" / "bin" / "python3"
    if venv_py.is_file() and os.access(venv_py, os.X_OK):
        env["E2E_PYTHON"] = str(venv_py.resolve())
        venv_bin = str((root / ".venv" / "bin").resolve())
        path_prefix = env.get("PATH", "")
        if not path_prefix.startswith(f"{venv_bin}:"):
            env["PATH"] = f"{venv_bin}:{path_prefix}" if path_prefix else venv_bin
    if step.id == "test-local:release" and suite_run:
        env["BV_TEST_SUITE_SMOKE_E2E"] = "1"
        env.pop("E2E_LLM", None)
        env.pop("E2E_SUPERPROJECT_LLM", None)
    if step.id == "e2e:llm:implement-auto-advance":
        env["E2E_IMPLEMENT_AUTO_ADVANCE_LLM"] = "1"
    elif step.id == "eval:prompts":
        from bright_vision_core.test_suite.local_llm import eval_prompts_step_env

        env.update(eval_prompts_step_env(suite_run=suite_run))
    elif step.id == "llm:core" or step.requires_ollama:
        env.update(llm_core_step_env(suite_run=suite_run))
    if step.id == "e2e:llm:superproject":
        env["E2E_SUPERPROJECT_LLM"] = "1"
    if step.id == "e2e:llm:router":
        env["E2E_MODEL_ROUTER"] = "1"
        env["BV_ROUTER_LLM_E2E_ONLY"] = "1"
        env.update(router_lane_step_env(suite_run=suite_run))
    if step.requires_cloud_config or step.id == "cloud-llm":
        env["E2E_CLOUD_LLM"] = "1"
    if step.id == "llm:core" and suite_run:
        env["BV_TEST_SUITE_LIVE_OUTPUT"] = "1"
        if os.environ.get("BV_SUITE_STRICT_PHASED_PYTEST") == "1":
            env["BV_SUITE_STRICT_PHASED_PYTEST"] = "1"
    if step.id == "e2e:llm" and suite_run:
        try:
            spec_s = float(env.get("LLM_SPEC_GEN_TIMEOUT_S", "3600"))
        except (TypeError, ValueError):
            spec_s = 3600.0
        floor = int(max(1200.0, spec_s * 0.75))
        try:
            current = int(float(env.get("BV_LLM_GPU_STALL_ABORT_S", "0")))
        except (TypeError, ValueError):
            current = 0
        env["BV_LLM_GPU_STALL_ABORT_S"] = str(max(current, floor))
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
    short_circuit: bool = False,
) -> tuple[bool, float, float | None, float | None, str]:
    """Run one step. Returns ok, seconds, gpu_avg, gpu_peak, combined capture text."""
    env = build_step_env(step, suite_run=suite_run, cwd=cwd)
    if short_circuit and step.id != "eval:prompts":
        env["BV_TEST_SUITE_SHORT_CIRCUIT"] = "1"

    if step.requires_ollama or step.id == "test-local:release":
        bits = [f"E2E_LLM={env.get('E2E_LLM', '(unset)')}"]
        if step.requires_ollama:
            bits.append(f"E2E_OLLAMA_MODEL={env.get('E2E_OLLAMA_MODEL', '')}")
            bits.append(f"BV_COMPACT_SPEC_GEN={env.get('BV_COMPACT_SPEC_GEN', '(unset)')}")
            bits.append(f"LLM_SPEC_GEN_TIMEOUT_S={env.get('LLM_SPEC_GEN_TIMEOUT_S', '')}")
            bits.append(f"E2E_SPEC_GEN_PHASED={env.get('E2E_SPEC_GEN_PHASED', '(unset)')}")
            if env.get("E2E_CODE_MODEL"):
                bits.append(f"E2E_CODE_MODEL={env.get('E2E_CODE_MODEL', '')}")
        if env.get("E2E_MODEL_ROUTER") == "1":
            bits.append("E2E_MODEL_ROUTER=1")
            from bright_vision_core.test_suite.router_preflight import resolve_router_tags

            fast, code, think = resolve_router_tags()
            bits.append(f"router fast={fast} code={code}" + (f" think={think}" if think else ""))
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
    warmup_failed = False
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
    if step.id in ("llm:core", "eval:prompts"):
        _warmup_script = cwd / "scripts" / "local-llm-warmup-for-tests.sh"
        if _warmup_script.is_file() and not os.environ.get("SKIP_OLLAMA_WARMUP"):
            backend = resolve_backend()
            backend_label = "LM Studio" if backend == "lmstudio" else "Ollama"
            _emit(
                on_event,
                {
                    "type": "step_line",
                    "stepId": step.id,
                    "stream": "stderr",
                    "line": (
                        f"Warming {backend_label} model "
                        f"({env.get('E2E_OLLAMA_MODEL', 'default')})"
                    ),
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
                warmup_failed = True
                backend = resolve_backend()
                if backend == "lmstudio":
                    hint = (
                        "LM Studio warmup failed — skipping pytest LLM suite. "
                        "Ensure LM Studio is running, model is on disk (`lms ls --json`), "
                        "Local Server can start (`lms server start`), "
                        "or run `sh scripts/lms-warmup-for-tests.sh` manually."
                    )
                else:
                    hint = (
                        "Ollama warmup failed — skipping pytest LLM suite. "
                        "Unload other models (`ollama ps` / `ollama stop <name>`), "
                        "or run `sh scripts/ollama-warmup-for-tests.sh` manually."
                    )
                _emit(
                    on_event,
                    {
                        "type": "step_line",
                        "stepId": step.id,
                        "stream": "stderr",
                        "line": hint,
                    },
                )
        if step.id == "llm:core" and not warmup_failed:
            _emit(
                on_event,
                {
                    "type": "step_line",
                    "stepId": step.id,
                    "stream": "stdout",
                    "line": (
                        f"pytest LLM suite (turn timeout {env.get('LLM_TEST_TURN_TIMEOUT_S')}s, "
                        f"suite SSE cap {env.get('BV_SUITE_LLM_TURN_TIMEOUT_S', '300')}s, "
                        f"agent {env.get('VISION_AGENT_PREPROC_TIMEOUT_S')}s, "
                        f"GPU stall cap {int(resolve_gpu_stall_abort_s(env))}s); "
                        "pytest via live :8741 Vision HTTP; stderr shows START/PASS."
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
    last_util_emit_at = step_start
    heartbeat_interval = (
        _LLM_CORE_HEARTBEAT_INTERVAL_S if step.id == "llm:core" else _HEARTBEAT_INTERVAL_S
    )
    live_gpu_samples: list[float] = []
    live_cpu_samples: list[float] = []
    live_mem_samples: list[float] = []
    gpu_stall_abort = False
    gpu_low_warned = False
    last_gpu_active_at = step_start
    last_cpu_active_at = step_start
    sse_wait_started_at: float | None = None
    short_circuit_hit = False
    short_circuit_abort_emitted = False
    proc: subprocess.Popen[str] | None = None
    gpu_baseline = gpu_baseline_for_step(step.id) if step.requires_ollama else {}
    expected_gpu_peak = float(gpu_baseline.get("medianGpuPeak") or 0)

    def touch_output() -> None:
        nonlocal last_line_at
        last_line_at = time.time()

    def _emit_live_util(sample: UtilizationSample, *, now: float) -> None:
        nonlocal last_gpu_active_at, last_cpu_active_at
        if sample.gpu_pct is not None:
            live_gpu_samples.append(sample.gpu_pct)
            if sample.gpu_pct > 0.5:
                last_gpu_active_at = now
        if sample.cpu_pct is not None:
            live_cpu_samples.append(sample.cpu_pct)
            if sample.cpu_pct >= _LLM_CPU_STALL_ACTIVITY_PCT:
                last_cpu_active_at = now
        if sample.mem_pct is not None:
            live_mem_samples.append(sample.mem_pct)
        peak_gpu = max(live_gpu_samples) if live_gpu_samples else None
        avg_gpu = (
            sum(live_gpu_samples) / len(live_gpu_samples) if live_gpu_samples else None
        )
        mem_peak = max(live_mem_samples) if live_mem_samples else None
        mem_avg = (
            sum(live_mem_samples) / len(live_mem_samples) if live_mem_samples else None
        )
        if (
            sample.gpu_pct is None
            and sample.cpu_pct is None
            and sample.mem_pct is None
            and peak_gpu is None
        ):
            return
        _emit(
            on_event,
            {
                "type": "step_util",
                "stepId": step.id,
                "cpuPct": sample.cpu_pct,
                "gpuPct": sample.gpu_pct,
                "gpuAvg": round(avg_gpu, 1) if avg_gpu is not None else None,
                "gpuPeak": round(peak_gpu, 1) if peak_gpu is not None else None,
                "memAvg": round(mem_avg, 1) if mem_avg is not None else None,
                "memPeak": round(mem_peak, 1) if mem_peak is not None else None,
            },
        )
        step_elapsed = int(now - step_start)
        gpu_idle_s = now - last_gpu_active_at
        cpu_idle_s = now - last_cpu_active_at
        abort, stall_s = should_gpu_stall_abort(
            step=step,
            step_env=env,
            use_gpu=use_gpu,
            step_elapsed_s=float(step_elapsed),
            gpu_idle_s=gpu_idle_s,
            cpu_idle_s=cpu_idle_s,
            sse_wait_started_at=sse_wait_started_at,
        )
        if abort:
            nonlocal gpu_stall_abort
            gpu_stall_abort = True
            elapsed_label = (
                format_duration(float(step_elapsed), use_brightdate=use_brightdate)
                if use_brightdate
                else f"{step_elapsed}s"
            )
            _emit(
                on_event,
                {
                    "type": "step_line",
                    "stepId": step.id,
                    "stream": "stderr",
                    "line": (
                        f"GPU stall abort: {step.id} ran {elapsed_label} with no GPU load "
                        f"for {int(stall_s)}s "
                        f"(LM Studio/Ollama may be wedged). "
                        f"Run: sh scripts/local-llm-warmup-for-tests.sh"
                    ),
                },
            )

    def maybe_heartbeat() -> None:
        nonlocal last_heartbeat_at, last_util_emit_at, gpu_stall_abort, gpu_low_warned
        now = time.time()
        step_elapsed = int(now - step_start)

        if (
            sample_resources_on_heartbeat
            and now - last_util_emit_at >= _UTIL_EMIT_INTERVAL_S
        ):
            last_util_emit_at = now
            sample = UtilizationSample()
            try:
                sample = sample_utilization()
            except Exception:
                sample = UtilizationSample()
            _emit_live_util(sample, now=now)

        if now - last_line_at < heartbeat_interval:
            return
        if now - last_heartbeat_at < heartbeat_interval:
            return
        last_heartbeat_at = now
        util = ""
        sample = UtilizationSample()
        if sample_resources_on_heartbeat:
            try:
                sample = sample_utilization()
                util = format_util_suffix(sample)
            except Exception:
                util = ""
        elapsed_label = (
            format_duration(float(step_elapsed), use_brightdate=use_brightdate)
            if use_brightdate
            else f"{step_elapsed}s"
        )
        _emit(
            on_event,
            {
                "type": "step_line",
                "stepId": step.id,
                "stream": "stderr",
                "line": (
                    f"… still running ({elapsed_label} this step{util}; "
                    "waiting for subprocess output)"
                ),
            },
        )
        if (
            step.requires_ollama
            and use_gpu
            and expected_gpu_peak >= 20
            and step_elapsed >= int(_LLM_GPU_LOW_WARN_S)
            and live_gpu_samples
            and max(live_gpu_samples) < expected_gpu_peak * 0.25
            and not gpu_low_warned
        ):
            gpu_low_warned = True
            _emit(
                on_event,
                {
                    "type": "step_line",
                    "stepId": step.id,
                    "stream": "stderr",
                    "line": (
                        f"GPU low vs history: peak ~{max(live_gpu_samples):.0f}% "
                        f"(median peak ~{expected_gpu_peak:.0f}% for {step.id})"
                    ),
                },
            )
            _emit(
                on_event,
                {
                    "type": "step_util",
                    "stepId": step.id,
                    "gpuWarn": True,
                    "gpuExpectedPeak": round(expected_gpu_peak, 1),
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

    def _note_sse_wait_line(line: str) -> None:
        nonlocal sse_wait_started_at
        if "waiting for SSE" in line:
            if sse_wait_started_at is None:
                sse_wait_started_at = time.time()
            return
        if any(
            marker in line
            for marker in (
                "… token:",
                "PASSED tests/core/",
                "START tests/core/",
                "… first SSE byte",
                "… done",
                "… Vision:",
            )
        ):
            sse_wait_started_at = None

    def _note_short_circuit_fail(line: str) -> None:
        nonlocal short_circuit_hit, short_circuit_abort_emitted
        if not short_circuit or not _line_indicates_test_fail(line):
            return
        short_circuit_hit = True
        _terminate_step_process(proc)

    def _emit_step_line(stream: str, raw_line: str) -> None:
        nonlocal short_circuit_hit, last_gpu_active_at
        line = strip_ansi(raw_line.rstrip("\n")) if suite_run else raw_line.rstrip("\n")
        if not line.strip():
            return
        if stream == "stderr":
            if line.startswith("START tests/core/"):
                last_gpu_active_at = time.time()
            _note_sse_wait_line(line)
        if stream == "stderr" and not _stderr_line_counts_as_progress(line):
            _emit(
                on_event,
                {"type": "step_line", "stepId": step.id, "stream": stream, "line": line},
            )
            _note_short_circuit_fail(line)
            return
        touch_output()
        _emit(
            on_event,
            {"type": "step_line", "stepId": step.id, "stream": stream, "line": line},
        )
        _note_short_circuit_fail(line)

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
    step_cancelled = False
    if warmup_failed:
        ok = False
        combined = (
            "Ollama warmup failed; pytest LLM suite was not started. "
            "See stderr above (unload other models or fix E2E_OLLAMA_MODEL)."
        )
    else:
        vision_proc: subprocess.Popen[str] | None = None
        try:
            step_argv = list(step.argv)
            if step.id in ("llm:core", "eval:prompts"):
                from bright_vision_core.test_suite.vision_spawn import (
                    spawn_vision_api,
                    terminate_vision_api,
                    vision_base_url,
                )

                def _vision_line(line: str) -> None:
                    _emit(
                        on_event,
                        {
                            "type": "step_line",
                            "stepId": step.id,
                            "stream": "stderr",
                            "line": line,
                        },
                    )

                vision_proc = spawn_vision_api(cwd, env, on_line=_vision_line)
                env["BV_LLM_PYTEST_VISION_URL"] = vision_base_url()
            if step.id == "llm:core":
                from bright_vision_core.test_suite.manifest import llm_core_pytest_argv

                step_argv = list(llm_core_pytest_argv())
            if short_circuit and step.id == "llm:core" and "--maxfail=1" not in step_argv:
                step_argv.append("--maxfail=1")
            if use_btime and use_gpu and gpu_bin:
                cmd = wrap_step_argv(
                    gpu_bin, step_argv, use_json=use_json, use_brightdate=use_brightdate
                )
            elif use_btime:
                from bright_vision_core.brightdate import btime_command_argv

                cmd = btime_command_argv(step_argv, use_brightdate=use_brightdate)
            else:
                cmd = step_argv

            proc = subprocess.Popen(
                cmd,
                cwd=cwd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                start_new_session=os.name != "nt",
            )
            threads = [
                threading.Thread(target=drain_stdout, daemon=True),
                threading.Thread(target=drain_stderr, daemon=True),
            ]
            for t in threads:
                t.start()
            while any(t.is_alive() for t in threads):
                if cancel_check and cancel_check():
                    _terminate_step_process(proc)
                    ok = False
                    step_cancelled = True
                    _emit(
                        on_event,
                        {
                            "type": "step_line",
                            "stepId": step.id,
                            "stream": "stderr",
                            "line": "cancelled: stopping step (user requested)",
                        },
                    )
                    break
                if gpu_stall_abort or short_circuit_hit:
                    _terminate_step_process(proc)
                    ok = False
                    if short_circuit_hit and not short_circuit_abort_emitted:
                        short_circuit_abort_emitted = True
                        _emit(
                            on_event,
                            {
                                "type": "step_line",
                                "stepId": step.id,
                                "stream": "stderr",
                                "line": "short-circuit: aborting step after test failure",
                            },
                        )
                    break
                maybe_heartbeat()
                time.sleep(0.1)
            for t in threads:
                t.join(timeout=5)
            if short_circuit and short_circuit_hit:
                _terminate_step_process(proc)
                ok = False
                if not short_circuit_abort_emitted:
                    short_circuit_abort_emitted = True
                    _emit(
                        on_event,
                        {
                            "type": "step_line",
                            "stepId": step.id,
                            "stream": "stderr",
                            "line": "short-circuit: aborting step after test failure",
                        },
                    )
            rc = proc.wait(timeout=30)
            if step_cancelled or (cancel_check and cancel_check()):
                ok = False
            elif rc != 0:
                ok = False
            combined = "".join(stderr_chunks)
            stdout_text = "".join(stdout_chunks)
        except Exception as err:
            ok = False
            _emit(on_event, {"type": "step_line", "stepId": step.id, "stream": "stderr", "line": str(err)})
            combined = str(err)
            stdout_text = ""
        finally:
            if vision_proc is not None:
                from bright_vision_core.test_suite.vision_spawn import terminate_vision_api

                terminate_vision_api(vision_proc)

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
        "shortCircuit": bool(short_circuit_hit and not ok),
        "cancelled": step_cancelled,
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
    fail_fast: bool = False,
    short_circuit: bool = False,
    spec_gen_phased: bool = False,
    run_options: SuiteRunOptions | None = None,
    on_event: EventCallback | None = None,
    cancel_check: Callable[[], bool] | None = None,
    start_from_step_id: str | None = None,
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
            implement_auto_advance_llm=opts.implement_auto_advance_llm,
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
            implement_auto_advance_llm=opts.implement_auto_advance_llm,
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
    start_index = 0
    if start_from_step_id:
        step_ids = [s.id for s in steps]
        if start_from_step_id not in step_ids:
            _emit(
                on_event,
                {
                    "type": "error",
                    "text": f"Unknown start_from_step_id {start_from_step_id!r} (not in current plan)",
                },
            )
            _emit(on_event, {"type": "run_finished", "ok": False, "totalSeconds": 0, "elapsedSeconds": 0})
            return False
        start_index = step_ids.index(start_from_step_id)
    needs_ollama = any(s.requires_ollama for s in steps[start_index:])
    if needs_ollama and not local_llm_reachable() and os.environ.get("SKIP_LLM") != "1":
        backend = resolve_backend()
        backend_hint = (
            "Start LM Studio (Local Server + `lms` on PATH)"
            if backend == "lmstudio"
            else "Start Ollama"
        )
        _emit(
            on_event,
            {
                "type": "error",
                "text": (
                    f"Local LLM ({backend}) not reachable but this plan includes LLM steps "
                    f"({backend_hint}, enable Skip LLM tiers, or uncheck router/LLM lanes)"
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
            "startFromStepId": start_from_step_id,
            "skippedStepIds": [s.id for s in steps[:start_index]],
        },
    )
    for skipped in steps[:start_index]:
        _emit(
            on_event,
            {
                "type": "step_skipped",
                "stepId": skipped.id,
                "label": skipped.label,
                "reason": "start_from_step",
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
    suite_cancelled = False

    for idx, step in enumerate(steps[start_index:], start=start_index + 1):
        if cancel_check and cancel_check():
            all_ok = False
            suite_cancelled = True
            _emit(on_event, {"type": "run_cancelled", "reason": "user request"})
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
            short_circuit=short_circuit,
        )
        if secs > 0:
            total_seconds += secs
        ran_ids.append(step.id)
        if not ok:
            all_ok = False
            if cancel_check and cancel_check():
                suite_cancelled = True
                _emit(on_event, {"type": "run_cancelled", "reason": "user request"})
                break
            if fail_fast or short_circuit:
                remaining = [s.id for s in steps[idx:] if s.id not in ran_ids]
                label = "short-circuit" if short_circuit else "fail-fast"
                if remaining:
                    stop_line = f"{label}: stopping suite ({len(remaining)} step(s) skipped)"
                else:
                    stop_line = f"{label}: suite stopped (last step failed)"
                _emit(
                    on_event,
                    {
                        "type": "step_line",
                        "stepId": step.id,
                        "stream": "stderr",
                        "line": stop_line,
                    },
                )
                break

    skipped_ids = [s.id for s in steps[:start_index]] + [
        s.id for s in steps[start_index:] if s.id not in ran_ids
    ]

    if total_seconds > 0:
        record_total(total_seconds, all_ok, ran_ids)

    _emit(
        on_event,
        {
            "type": "run_finished",
            "ok": all_ok and not suite_cancelled,
            "totalSeconds": total_seconds,
            "elapsedSeconds": time.time() - start,
            "failFast": bool(fail_fast and skipped_ids),
            "skippedStepIds": skipped_ids,
            "cancelled": suite_cancelled,
        },
    )
    return all_ok
