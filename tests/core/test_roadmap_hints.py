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


def test_appends_hint_for_lets_work_on_next_thing():
    coder = Mock()
    coder.get_inchat_relative_files.return_value = ["docs/ROADMAP.md"]
    out = maybe_append_roadmap_hint("let's work on the next thing shall we?", coder)
    assert "Suggested fix order" in out


def test_hint_not_duplicated_when_already_present():
    coder = Mock()
    coder.get_inchat_relative_files.return_value = ["docs/ROADMAP.md"]
    once = maybe_append_roadmap_hint("what's next?", coder)
    twice = maybe_append_roadmap_hint(once, coder)
    assert twice == once
    assert twice.count("Suggested fix order") == 1


def test_run_message_user_event_includes_roadmap_hint():
    """Session.run_message must emit hinted text before slash/LLM (dogfood #8012d6bd)."""
    import os
    from pathlib import Path

    root = Path(os.environ.get("BRIGHT_VISION_SUPERPROJECT", Path(__file__).resolve().parents[2]))
    roadmap = root / "docs/ROADMAP.md"
    if not roadmap.is_file() or not (root / "cecli").is_dir():
        import pytest

        pytest.skip("requires BrightVision superproject with docs/ROADMAP.md")

    from bright_vision_core.session import Session

    session = Session.create(
        str(root),
        files=[str(roadmap)],
        yes=True,
        dry_run=True,
    )
    user_event = None
    gen = session.run_message("let's work on the next thing shall we?", preproc=False)
    try:
        for event in gen:
            if event.get("type") == "user_message":
                user_event = event
                break
    finally:
        gen.close()

    assert user_event is not None
    assert "Suggested fix order" in user_event.get("text", "")
