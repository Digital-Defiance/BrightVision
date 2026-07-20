"""Headless /hot-reload — recreate coder after config refresh (cecli v0.100.8+)."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

from cecli.coders import Coder
from cecli.commands import ReloadProgramSignal
from cecli.helpers.file_searcher import handle_core_files

from bright_vision_core.async_bridge import rebind_coder_loop_primitives, run

if TYPE_CHECKING:
    from bright_vision_core.event_io import EventIO


async def hot_reload_coder(io: EventIO, old_coder: Coder) -> Coder:
    """Match cecli TUI/main reload: save session, tear down hooks/MCP, recreate coder."""
    from cecli.helpers.conversation import ConversationService, MessageTag
    from cecli.hooks import HookService

    await old_coder.auto_save_session(force=True)
    mcp = getattr(old_coder, "mcp_manager", None)
    if mcp is not None and mcp.is_connected:
        await mcp.disconnect_all()
    try:
        HookService.destroy_instances(old_coder.uuid)
    except Exception:
        pass

    try:
        handle_core_files(Path(".cecli.conf.yml"))
    except Exception:
        pass

    for tag in (MessageTag.SYSTEM, MessageTag.EXAMPLES, MessageTag.STATIC):
        try:
            ConversationService.get_manager(old_coder).clear_tag(tag)
        except Exception:
            pass

    kwargs: dict[str, Any] = {
        "io": io,
        "from_coder": old_coder,
        "num_cache_warming_pings": 0,
        "args": old_coder.args,
    }
    new_coder = await Coder.create(**kwargs)
    new_coder.yield_stream = True
    new_coder.stream = bool(old_coder.stream)
    new_coder.pretty = False
    commands = old_coder.commands.clone()
    commands.coder = new_coder
    new_coder.commands = commands
    rebind_coder_loop_primitives(new_coder)
    return new_coder


def apply_hot_reload(session: Any, signal: ReloadProgramSignal | None = None) -> list[dict]:
    """Replace session coder after /hot-reload; return drained EventIO events."""
    old = (signal.kwargs.get("from_coder") if signal is not None else None) or session.coder
    session.coder = run(hot_reload_coder(session.io, old))
    session.coder.commands.coder = session.coder
    session._router_heavy_model_name = session.coder.main_model.name
    session.io.tool_output("Configuration hot-reloaded — chat context preserved.")
    return session.io.drain_events()
