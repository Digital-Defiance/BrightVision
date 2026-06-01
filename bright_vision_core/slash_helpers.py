"""Headless cecli slash-command helpers."""

from __future__ import annotations

import os
from collections.abc import Coroutine
from typing import Any, TypeVar

from cecli.commands import SwitchCoderSignal

from bright_vision_core.async_bridge import run

T = TypeVar("T")

# Slash commands that run a full temporary coder + generate() inside preproc.
LONG_RUNNING_SLASH_COMMANDS = frozenset(
    {
        "agent",
        "ask",
        "code",
        "architect",
        "context",
        "hashline",
        "invoke-agent",
    }
)

def fast_slash_preproc_timeout_s() -> float:
    """Wall-clock cap for quick slash/preproc (read env each call)."""
    return float(os.environ.get("VISION_SLASH_PREPROC_TIMEOUT_S", "300"))


def resolve_slash_command_name(user_text: str, commands: Any) -> str | None:
    """Normalized slash command (no leading ``/``), or ``None`` if not a command."""
    inp = user_text.strip()
    if not commands.is_command(inp):
        return None
    res = commands.matching_commands(inp)
    if res is None:
        return None
    matching_commands, first_word, _rest = res
    if len(matching_commands) == 1:
        return matching_commands[0][1:]
    if first_word in matching_commands:
        return first_word[1:]
    return None


def slash_preproc_timeout_s(user_text: str, commands: Any) -> float | None:
    """
    Wall-clock cap for ``preproc_user_input`` (slash handling).

    Long-running mode commands (``/agent``, ``/ask`` with a prompt, …) default to
    **no cap** — use **Stop** in the UI. Set ``VISION_AGENT_PREPROC_TIMEOUT_S`` to
    a positive number to enforce a limit. Other slash work keeps
    ``VISION_SLASH_PREPROC_TIMEOUT_S`` (default 300s).
    """
    cmd = resolve_slash_command_name(user_text, commands)
    if cmd in LONG_RUNNING_SLASH_COMMANDS:
        raw = os.environ.get("VISION_AGENT_PREPROC_TIMEOUT_S", "0")
        cap = float(raw)
        return None if cap <= 0 else cap
    return fast_slash_preproc_timeout_s()


def is_switch_coder_signal(exc: BaseException) -> bool:
    """True when *exc* is (or wraps) cecli's non-error coder refresh signal."""
    if isinstance(exc, SwitchCoderSignal):
        return True
    if isinstance(exc, BaseExceptionGroup):
        return any(is_switch_coder_signal(e) for e in exc.exceptions)
    return False


def run_slash_command_sync(coder: Any, cmd: str, args: str) -> None:
    """
    Run a cecli slash command from sync HTTP/session code.

    ``/add`` and similar commands raise :class:`SwitchCoderSignal` after success
    so the TUI can rebuild the coder; headless callers treat that as success.
    """
    try:
        run(coder.commands.execute(cmd, args, coder=coder))
    except BaseException as exc:
        if is_switch_coder_signal(exc):
            return
        raise


def run_coro_ignore_switch_coder(coro: Coroutine[object, object, T]) -> T | None:
    """Like :func:`run`, but return ``None`` when the coroutine signals a coder switch."""
    try:
        return run(coro)
    except BaseException as exc:
        if is_switch_coder_signal(exc):
            return None
        raise
