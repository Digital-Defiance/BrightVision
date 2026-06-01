"""Capture mode: bgpucap vs btime-only dumb mode."""

from __future__ import annotations

from bright_vision_core.test_suite.capture_mode import (
    capture_mode_note,
    gpu_wrap_enabled,
    host_supports_bgpucap,
    resolve_capture_mode,
)


def test_resolve_capture_mode_off_when_skip_gpu():
    assert resolve_capture_mode(skip_gpu=True) == "off"
    assert not gpu_wrap_enabled(skip_gpu=True)


def test_capture_mode_note_strings():
    assert "btime" in capture_mode_note("btime_only").lower()
    assert "Apple" in capture_mode_note("bgpucap") or "bgpucap" in capture_mode_note("bgpucap")


def test_host_supports_bgpucap_on_darwin_arm64(monkeypatch):
    monkeypatch.setattr("bright_vision_core.test_suite.capture_mode.sys.platform", "darwin")
    monkeypatch.setattr("bright_vision_core.test_suite.capture_mode.platform.machine", lambda: "arm64")
    assert host_supports_bgpucap() is True


def test_host_supports_bgpucap_false_on_linux(monkeypatch):
    monkeypatch.setattr("bright_vision_core.test_suite.capture_mode.sys.platform", "linux")
    monkeypatch.setattr("bright_vision_core.test_suite.capture_mode.platform.machine", lambda: "x86_64")
    assert host_supports_bgpucap() is False
    assert resolve_capture_mode(skip_gpu=False) == "btime_only"
