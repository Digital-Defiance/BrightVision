"""Tests for pytest SSE client live progress formatting."""

from __future__ import annotations

from llm_client import _live_duration_label


def test_live_duration_label_wall_clock(monkeypatch):
    monkeypatch.delenv("BV_SUITE_USE_BRIGHTDATE", raising=False)
    assert _live_duration_label(30.0) == "30.0s"


def test_live_duration_label_brightdate(monkeypatch):
    monkeypatch.setenv("BV_SUITE_USE_BRIGHTDATE", "1")
    label = _live_duration_label(30.0)
    assert "md" in label or " d" in label
