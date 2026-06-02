"""Tests for headless slash-command signal handling."""

from __future__ import annotations

from cecli.commands import SwitchCoderSignal

from bright_vision_core.slash_helpers import (
    is_switch_coder_signal,
    resolve_slash_command_name,
    synthetic_slash_preproc_input,
)


class _MockCommands:
    def is_command(self, inp: str) -> bool:
        return inp.strip().startswith("/")

    def matching_commands(self, inp: str):
        words = inp.strip().split(maxsplit=1)
        if not words:
            return None
        first = words[0]
        rest = inp.strip()[len(first) :].strip()
        return [first], first, rest


def test_synthetic_slash_preproc_input_with_task_inject() -> None:
    commands = _MockCommands()
    message = "/agent Implement the active task"
    user_text = "[Active task: Explore · id abc]\n\n---\n" + message
    got = synthetic_slash_preproc_input(message, user_text, commands)
    assert got == "/agent [Active task: Explore · id abc]\n\n---\nImplement the active task"


def test_synthetic_slash_preproc_input_passthrough_when_already_command() -> None:
    commands = _MockCommands()
    message = "/agent go"
    assert synthetic_slash_preproc_input(message, message, commands) is None


def test_resolve_slash_command_name_on_raw_message() -> None:
    commands = _MockCommands()
    assert resolve_slash_command_name("/agent explore", commands) == "agent"


def test_is_switch_coder_signal_direct() -> None:
    assert is_switch_coder_signal(SwitchCoderSignal(edit_format="diff"))


def test_is_switch_coder_signal_in_group() -> None:
    inner = SwitchCoderSignal(edit_format="diff")
    group = BaseExceptionGroup("task failures", [RuntimeError("x"), inner])
    assert is_switch_coder_signal(group)


def test_is_switch_coder_signal_rejects_other() -> None:
    assert not is_switch_coder_signal(ValueError("nope"))
    assert not is_switch_coder_signal(
        BaseExceptionGroup("task failures", [RuntimeError("x"), ValueError("y")])
    )
