"""Roadmap hint injection for /agent priority questions."""

from types import SimpleNamespace
from unittest.mock import Mock

from bright_vision_core.roadmap_hints import maybe_append_roadmap_hint


def test_appends_hint_when_roadmap_in_chat_and_user_asks_whats_next():
    coder = Mock()
    coder.get_inchat_relative_files.return_value = ["docs/ROADMAP.md"]
    out = maybe_append_roadmap_hint("what's next?", coder)
    assert "Suggested fix order" in out
    assert "ReadRange" in out


def test_no_hint_without_roadmap_in_chat():
    coder = Mock()
    coder.get_inchat_relative_files.return_value = ["README.md"]
    out = maybe_append_roadmap_hint("what's next?", coder)
    assert out == "what's next?"
