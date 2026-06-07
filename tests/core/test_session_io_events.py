"""Session SSE helpers — slash /agent emits assistant_complete, not token."""

from __future__ import annotations

from bright_vision_core.event_io import EventIO
from bright_vision_core.session import _drain_io_events


def test_drain_mirrors_assistant_complete_to_token() -> None:
    io = EventIO(yes=True)
    io.emit("assistant_complete", text="hello from agent")
    acc: list[str] = []
    events = list(
        _drain_io_events(io, mirror_assistant_complete=True, assistant_text=acc)
    )
    types = [e["type"] for e in events]
    assert types == ["assistant_complete", "token"]
    assert events[1]["text"] == "hello from agent"
    assert acc == ["hello from agent"]


def test_drain_without_mirror_leaves_token_absent() -> None:
    io = EventIO(yes=True)
    io.emit("assistant_complete", text="silent")
    events = list(_drain_io_events(io))
    assert [e["type"] for e in events] == ["assistant_complete"]


def test_model_route_emit_then_drain_yields_once() -> None:
    """Regression: yielding emit() return and drain_events() duplicated model_route SSE."""
    io = EventIO(yes=True)
    io.emit(
        "model_route",
        tier="heavy",
        model="ollama_chat/qwen",
        estimated_tokens=71,
        reasons=["forced:heavy"],
        escalated=False,
    )
    events = io.drain_events()
    assert len(events) == 1
    assert events[0]["type"] == "model_route"
