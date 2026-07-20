"""Headless /hot-reload after cecli v0.100.8."""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("cecli.coders", reason="Cecli not on PYTHONPATH — run: source activate.sh")

from cecli.coders import Coder
from cecli.commands import Commands, ReloadProgramSignal
from cecli.io import InputOutput
from cecli.models import Model

from bright_vision_core.event_io import EventIO
from bright_vision_core.headless_args import default_headless_args
from bright_vision_core.hot_reload import apply_hot_reload
from bright_vision_core.session import Session
from bright_vision_core.slash_helpers import is_reload_program_signal


@pytest.fixture
def headless_args():
    return default_headless_args(yes=True)


@pytest.mark.asyncio
async def test_hot_reload_command_raises_reload_signal(tmp_path: Path, headless_args):
    io = InputOutput(pretty=False, fancy_input=False, yes=True)
    model = Model("gpt-3.5-turbo")
    coder = await Coder.create(model, None, io, args=headless_args)
    commands = Commands(io, coder)

    with pytest.raises(ReloadProgramSignal) as exc_info:
        await commands.execute("hot-reload", "", coder=coder)

    assert exc_info.value.kwargs.get("from_coder") is coder


def test_is_reload_program_signal():
    assert is_reload_program_signal(ReloadProgramSignal("reload", from_coder=object()))
    assert not is_reload_program_signal(ValueError("nope"))


@pytest.mark.asyncio
async def test_apply_hot_reload_preserves_chat_files(tmp_path: Path, headless_args):
    workspace = tmp_path / "repo"
    workspace.mkdir()
    sample = workspace / "alpha.txt"
    sample.write_text("hello\n", encoding="utf-8")

    io = EventIO(yes=True, pretty=False)
    model = Model("gpt-3.5-turbo")
    coder = await Coder.create(
        model,
        None,
        io,
        fnames=[str(sample)],
        args=headless_args,
    )
    commands = Commands(io, coder)
    commands.coder = coder
    session = Session(coder, io)

    with pytest.raises(ReloadProgramSignal) as exc_info:
        await commands.execute("hot-reload", "", coder=coder)

    events = apply_hot_reload(session, exc_info.value)
    assert any(
        "hot-reloaded" in str(e.get("text") or "").lower()
        for e in events
        if e.get("type") == "tool_output"
    )
    assert "alpha.txt" in session.coder.get_inchat_relative_files()
