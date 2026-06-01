"""TestClient helpers for E2E_LLM=1 pytest (timeouts + interrupt on hang)."""

from __future__ import annotations

import concurrent.futures
import json
import os
import sys
import threading
import time
from typing import TYPE_CHECKING

from llm_sse import parse_sse_payload

if TYPE_CHECKING:
    from fastapi.testclient import TestClient


def _live_stderr() -> bool:
    return (
        os.environ.get("BV_TEST_SUITE_LIVE_OUTPUT") == "1"
        or os.environ.get("E2E_LLM") == "1"
    )


def _emit_live_progress(line: str) -> None:
    if _live_stderr():
        print(line, file=sys.stderr, flush=True)


def turn_timeout_s(content: str) -> float:
    """Wall-clock cap for one POST .../messages SSE read in pytest."""
    base = float(os.environ.get("LLM_TEST_TURN_TIMEOUT_S", "300"))
    if content.strip().startswith("/agent"):
        raw = os.environ.get("VISION_AGENT_PREPROC_TIMEOUT_S", "0")
        agent_cap = float(raw)
        if agent_cap > 0:
            return max(base, agent_cap + 30.0)
    return base


def _parse_sse_chunk(buf: str) -> tuple[list[dict], str]:
    """Return (events, remainder) from accumulated SSE text."""
    events: list[dict] = []
    while "\n\n" in buf:
        part, buf = buf.split("\n\n", 1)
        for line in part.split("\n"):
            if not line.startswith("data: "):
                continue
            try:
                events.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                continue
    return events, buf


def stream_session_message(
    client: TestClient,
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
                            f"… first SSE byte after {wait}s (Ollama may have been cold)"
                        )
                buf += chunk.decode("utf-8", errors="replace")
                batch, buf = _parse_sse_chunk(buf)
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
            for ev in parse_sse_payload(buf):
                all_events.append(ev)

    started = time.time()
    stop_watch = threading.Event()

    def _watch_sse() -> None:
        while not stop_watch.wait(30.0):
            elapsed = int(time.time() - started)
            _emit_live_progress(
                f"… waiting for SSE ({elapsed}s / {int(cap)}s cap) — "
                "if this persists, run: ollama ps && sh scripts/ollama-warmup-for-tests.sh"
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
        raise TimeoutError(
            f"SSE timed out after {int(cap)}s for message: {content[:120]!r}"
        ) from err
    finally:
        stop_watch.set()
        pool.shutdown(wait=False, cancel_futures=True)

    return all_events
