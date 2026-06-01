"""Slash preproc wall-clock limits — /agent vs fast commands."""

from __future__ import annotations

from typing import Any

import pytest

from bright_vision_core.slash_helpers import (
    fast_slash_preproc_timeout_s,
    resolve_slash_command_name,
    slash_preproc_timeout_s,
)


class _MockCommands:
    def is_command(self, inp: str) -> bool:
        return inp.strip().startswith("/")

    def matching_commands(self, inp: str):
        words = inp.strip().split()
        if not words:
            return None
        cmd = words[0]
        rest = inp[len(words[0]) :].strip()
        if cmd in ("/agent", "/add", "/clear"):
            return [cmd], cmd, rest
        return None


@pytest.fixture
def commands() -> Any:
    return _MockCommands()


def test_resolve_agent_command(commands) -> None:
    assert resolve_slash_command_name("/agent fix the bug", commands) == "agent"


def test_agent_default_no_preproc_cap(commands, monkeypatch) -> None:
    monkeypatch.delenv("VISION_AGENT_PREPROC_TIMEOUT_S", raising=False)
    assert slash_preproc_timeout_s("/agent explore the repo", commands) is None


def test_agent_optional_cap(commands, monkeypatch) -> None:
    monkeypatch.setenv("VISION_AGENT_PREPROC_TIMEOUT_S", "600")
    assert slash_preproc_timeout_s("/agent explore the repo", commands) == 600.0


def test_fast_slash_keeps_cap(commands, monkeypatch) -> None:
    monkeypatch.setenv("VISION_SLASH_PREPROC_TIMEOUT_S", "120")
    assert slash_preproc_timeout_s("/add src/foo.ts", commands) == 120.0
    assert slash_preproc_timeout_s("hello world", commands) == 120.0


def test_fast_default_300(commands, monkeypatch) -> None:
    monkeypatch.delenv("VISION_SLASH_PREPROC_TIMEOUT_S", raising=False)
    assert fast_slash_preproc_timeout_s() == 300.0
    assert slash_preproc_timeout_s("/clear", commands) == 300.0
