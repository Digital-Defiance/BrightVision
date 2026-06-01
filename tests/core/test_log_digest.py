"""Transcript digest for agent context."""

from __future__ import annotations

from bright_vision_core.test_suite.log_digest import (
    agent_digest_from_text,
    compress_transcript_text,
)


def test_compress_collapses_heartbeats():
    raw = "\n".join(
        [
            "> step",
            "[stderr] … still running (10s this step · GPU 90%; waiting)",
            "[stderr] … still running (20s this step · GPU 95%; waiting)",
            "START test_foo",
            "FAILED test_foo",
        ]
    )
    out = compress_transcript_text(raw)
    assert out.count("still running") == 1
    assert "collapsed 2" in out and "heartbeat" in out
    assert "START test_foo" in out


def test_agent_digest_includes_failure_excerpt():
    raw = "\n".join(
        [
            "> yarn test:llm:core",
            "[stderr] … still running (10s this step; waiting)",
            "E   TimeoutError: SSE timed out",
            "[ FAIL ] yarn test:llm:core",
        ]
    )
    digest = agent_digest_from_text(raw, max_chars=50_000)
    assert "TimeoutError" in digest
    assert "FAIL" in digest
