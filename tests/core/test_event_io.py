"""EventIO headless confirm compatibility with cecli."""

from __future__ import annotations

import asyncio

import pytest

from bright_vision_core.event_io import EventIO


def test_confirm_ask_accepts_group_response_kwarg() -> None:
    io = EventIO(yes=True)
    assert asyncio.run(io.confirm_ask("Run tools?", group_response="Run MCP Tools")) is True
    assert io.group_responses["Run MCP Tools"] is True


def test_confirm_ask_uses_group_response_cache() -> None:
    io = EventIO(yes=False)
    io.group_responses["Run MCP Tools"] = False
    assert asyncio.run(io.confirm_ask("Run tools?", group_response="Run MCP Tools")) is False


@pytest.mark.asyncio
async def test_confirm_ask_declines_shell_during_llm_e2e(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("E2E_LLM", "1")
    io = EventIO(yes=False)
    ok = await io.confirm_ask(
        "Run shell command?",
        subject="echo hello",
        explicit_yes_required=True,
    )
    assert ok is False
    confirms = [e for e in io.events if e.get("type") == "confirm"]
    assert len(confirms) == 1
    assert confirms[0].get("auto_answered") is True
    assert confirms[0].get("default") is False


@pytest.mark.asyncio
async def test_confirm_ask_declines_add_file_during_llm_e2e(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("E2E_LLM", "1")
    io = EventIO(yes=False)
    ok = await io.confirm_ask("Add file to the chat?", subject="src/patchme.ts")
    assert ok is False
    confirms = [e for e in io.events if e.get("type") == "confirm"]
    assert confirms[0].get("auto_answered") is True


@pytest.mark.asyncio
async def test_offer_url_blocked_during_llm_e2e(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("E2E_LLM", "1")
    opened: list[str] = []

    def _open(url: str, *_args, **_kwargs) -> None:
        opened.append(url)

    monkeypatch.setattr("cecli.io.webbrowser.open", _open)
    io = EventIO(yes=True)
    ok = await io.offer_url("https://cecli.dev/docs/troubleshooting/token-limits.html")
    assert ok is False
    assert opened == []
