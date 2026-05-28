"""TestClient helpers for E2E_LLM=1 pytest (timeouts + interrupt on hang)."""

from __future__ import annotations

import concurrent.futures
import os
from typing import TYPE_CHECKING

from llm_sse import parse_sse_payload

if TYPE_CHECKING:
    from fastapi.testclient import TestClient


def turn_timeout_s(content: str) -> float:
    """Wall-clock cap for one POST .../messages SSE read in pytest."""
    base = float(os.environ.get("LLM_TEST_TURN_TIMEOUT_S", "300"))
    if content.strip().startswith("/agent"):
        agent_cap = float(os.environ.get("VISION_AGENT_PREPROC_TIMEOUT_S", "480"))
        return max(base, agent_cap + 30.0)
    return base


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

    def _read_body() -> str:
        with client.stream(
            "POST",
            f"/sessions/{session_id}/messages",
            json={"content": content, "preproc": preproc},
        ) as stream:
            if stream.status_code != 200:
                raise AssertionError(f"messages stream: {stream.status_code}")
            return stream.read().decode("utf-8")

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    fut = pool.submit(_read_body)
    try:
        body = fut.result(timeout=cap)
    except concurrent.futures.TimeoutError as err:
        try:
            client.post(f"/sessions/{session_id}/interrupt")
        except Exception:
            pass
        raise TimeoutError(
            f"SSE timed out after {int(cap)}s for message: {content[:120]!r}"
        ) from err
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    return parse_sse_payload(body)
