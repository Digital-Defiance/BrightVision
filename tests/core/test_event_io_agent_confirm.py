"""EventIO agent auto-confirm during /agent preproc."""

from __future__ import annotations

import asyncio

from bright_vision_core.event_io import EventIO


def test_agent_auto_confirm_bypasses_explicit_yes_required() -> None:
    io = EventIO(yes=False)
    with io.agent_auto_confirm():
        assert (
            asyncio.run(
                io.confirm_ask("Add file to the chat?", explicit_yes_required=True, subject="Cargo.toml")
            )
            is True
        )
    assert io.events[-1]["type"] == "confirm"
    assert io.events[-1]["auto_answered"] is True


def test_agent_auto_confirm_depth_resets() -> None:
    io = EventIO(yes=False)
    with io.agent_auto_confirm():
        assert io._agent_auto_confirm_depth == 1
    assert io._agent_auto_confirm_depth == 0


def test_confirm_skips_add_file_when_already_in_chat() -> None:
    io = EventIO(yes=False)
    io.set_chat_rel_files(["Cargo.toml"])
    assert asyncio.run(io.confirm_ask("Add file to the chat?", subject="Cargo.toml")) is True
    assert io.events[-1]["auto_answered"] is True


def test_confirm_skips_add_file_by_basename() -> None:
    io = EventIO(yes=False)
    io.set_chat_rel_files(["crates/foo/Cargo.toml"])
    assert asyncio.run(io.confirm_ask("Add file to the chat?", subject="Cargo.toml")) is True
    assert io.events[-1]["auto_answered"] is True


def test_agent_mode_active_auto_confirms() -> None:
    io = EventIO(yes=False)
    io._agent_mode_active = True
    assert (
        asyncio.run(
            io.confirm_ask(
                "Run shell command?",
                subject="find .",
                explicit_yes_required=True,
            )
        )
        is True
    )
    assert io.events[-1]["auto_answered"] is True
