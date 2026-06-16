"""TestClient helpers for E2E_LLM=1 pytest (timeouts + interrupt on hang)."""

from __future__ import annotations

import concurrent.futures
import os
import sys
import threading
import time
from typing import TYPE_CHECKING, Any

from llm_sse import parse_sse_chunk, parse_sse_payload

if TYPE_CHECKING:
    from fastapi.testclient import TestClient

LlmVisionClient = Any


def create_llm_vision_client() -> LlmVisionClient:
    """In-process ``TestClient`` locally; live ``:8741`` HTTP when suite sets ``BV_LLM_PYTEST_VISION_URL``."""
    base = os.environ.get("BV_LLM_PYTEST_VISION_URL", "").strip()
    if base:
        from llm_http_client import HttpVisionClient

        return HttpVisionClient(base)
    from fastapi.testclient import TestClient

    from bright_vision_core.http_api import app

    return TestClient(app)


def add_session_files(client: LlmVisionClient, session_id: str, paths: list[str]) -> list[str]:
    """Add workspace files to chat context without a slash turn (no LLM)."""
    res = client.post(f"/sessions/{session_id}/files", json={"paths": paths})
    if res.status_code != 200:
        raise AssertionError(f"POST /files: {res.status_code} {res.text}")
    in_chat = [
        p.replace("\\", "/") for p in (res.json().get("files_in_chat") or [])
    ]
    return in_chat


def _live_stderr() -> bool:
    return (
        os.environ.get("BV_TEST_SUITE_LIVE_OUTPUT") == "1"
        or os.environ.get("E2E_LLM") == "1"
    )


def _live_duration_label(sec: float) -> str:
    from bright_vision_core.test_suite.timing import format_duration

    return format_duration(sec)


def _emit_live_progress(line: str) -> None:
    if _live_stderr():
        print(line, file=sys.stderr, flush=True)


def turn_timeout_s(content: str) -> float:
    """Wall-clock cap for one POST .../messages SSE read in pytest."""
    if os.environ.get("BV_TEST_SUITE_ACTIVE") == "1":
        suite_cap = os.environ.get("BV_SUITE_LLM_TURN_TIMEOUT_S", "").strip()
        if suite_cap:
            base = float(suite_cap)
        else:
            base = float(os.environ.get("LLM_TEST_TURN_TIMEOUT_S", "300"))
    else:
        base = float(os.environ.get("LLM_TEST_TURN_TIMEOUT_S", "300"))
    if content.strip().startswith("/agent"):
        raw = os.environ.get("VISION_AGENT_PREPROC_TIMEOUT_S", "0")
        agent_cap = float(raw)
        if agent_cap > 0:
            return max(base, agent_cap + 30.0)
    return base


def stream_session_message(
    client: LlmVisionClient,
    session_id: str,
    content: str,
    *,
    preproc: bool = True,
    timeout_s: float | None = None,
) -> list[dict]:
    """
    POST a user message and parse SSE events.

    Raises ``TimeoutError`` when the stream does not finish in time (best-effort
    ``POST /interrupt`` so a stuck Ollama turn does not block the whole suite).
    On timeout the ``client`` is closed; allocate a new ``TestClient(app)`` before retrying.
    """
    cap = timeout_s if timeout_s is not None else turn_timeout_s(content)
    all_events: list[dict] = []

    def _read_stream() -> None:
        buf = ""
        started = time.time()
        saw_sse = False
        with client.stream(
            "POST",
            f"/sessions/{session_id}/messages",
            json={"content": content, "preproc": preproc},
        ) as stream:
            if stream.status_code != 200:
                raise AssertionError(f"messages stream: {stream.status_code}")
            for chunk in stream.iter_bytes():
                if not chunk:
                    continue
                if not saw_sse:
                    saw_sse = True
                    wait = int(time.time() - started)
                    if wait >= 5:
                        _emit_live_progress(
                            f"… first SSE byte after {_live_duration_label(wait)} "
                            "(Ollama may have been cold)"
                        )
                buf += chunk.decode("utf-8", errors="replace")
                batch, buf = parse_sse_chunk(buf)
                for ev in batch:
                    all_events.append(ev)
                    t = ev.get("type")
                    if t == "progress":
                        msg = ev.get("message") or ev.get("text") or ""
                        _emit_live_progress(f"… {ev.get('label', 'Vision')}: {msg}")
                    elif t == "token":
                        text = str(ev.get("text") or "")
                        if text.strip():
                            preview = text[:80].replace("\n", " ")
                            _emit_live_progress(f"… token: {preview}")
                    elif t in ("error", "done"):
                        _emit_live_progress(f"… {t}")
        if buf.strip():
            all_events.extend(parse_sse_payload(buf))

    started = time.time()
    stop_watch = threading.Event()

    def _watch_sse() -> None:
        while not stop_watch.wait(30.0):
            elapsed = int(time.time() - started)
            _emit_live_progress(
                f"… waiting for SSE ({_live_duration_label(elapsed)} / "
                f"{_live_duration_label(cap)} cap) — "
                "if this persists, run: sh scripts/local-llm-warmup-for-tests.sh"
            )

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    watcher = threading.Thread(target=_watch_sse, daemon=True)
    watcher.start()
    fut = pool.submit(_read_stream)
    try:
        fut.result(timeout=cap)
    except concurrent.futures.TimeoutError as err:
        try:
            client.post(f"/sessions/{session_id}/interrupt")
        except Exception:
            pass
        # A timed-out stream leaves a blocking read on this TestClient; close so
        # callers can allocate a fresh client for retry (LM Studio + Starlette).
        try:
            client.close()
        except Exception:
            pass
        if os.environ.get("BV_TEST_SUITE_SHORT_CIRCUIT") == "1":
            _emit_live_progress(
                f"FAILED short-circuit: SSE timed out after {_live_duration_label(cap)}"
            )
        raise TimeoutError(
            f"SSE timed out after {_live_duration_label(cap)} for message: {content[:120]!r}"
        ) from err
    finally:
        stop_watch.set()
        pool.shutdown(wait=False, cancel_futures=True)

    return all_events


def wait_spec_job(
    client: LlmVisionClient,
    job_id: str,
    *,
    timeout_s: float,
) -> dict[str, Any]:
    """
    Block until a background generate-spec job finishes.

  When ``BV_LLM_PYTEST_VISION_URL`` is set, polls the live Vision API; otherwise uses
    the in-process ``spec_job_store`` (``TestClient(app)``).
    """
    base = os.environ.get("BV_LLM_PYTEST_VISION_URL", "").strip()
    if base:
        deadline = time.time() + timeout_s
        last_status = "unknown"
        while time.time() < deadline:
            res = client.get(f"/workspaces/todos/generate-spec/{job_id}")
            if res.status_code == 404:
                raise KeyError(f"Unknown job: {job_id}")
            if res.status_code != 200:
                raise AssertionError(f"spec job poll: {res.status_code} {res.text}")
            body = res.json()
            last_status = str(body.get("status") or "unknown")
            if last_status in ("completed", "error"):
                return body
            time.sleep(0.25)
        raise TimeoutError(
            f"Spec generation job timed out: {job_id} (last status {last_status!r})"
        )

    from bright_vision_core.todo_spec_jobs import spec_job_store

    job = spec_job_store.wait(job_id, timeout_s=timeout_s)
    return {
        "status": job.status,
        "error": job.error,
        "requirements": job.requirements,
        "design": job.design,
        "tasks_md": job.tasks_md,
        "raw": job.raw,
        "ears_blocked": job.ears_blocked,
        "ears_issues": job.ears_issues,
    }
