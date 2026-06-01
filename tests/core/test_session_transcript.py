"""Session transcript export for UI hydrate."""

from __future__ import annotations

from bright_vision_core.session_transcript import transcript_rows_from_coder


class _FakeCoder:
    def __init__(self, done, cur):
        self.done_messages = done
        self.cur_messages = cur


def test_transcript_rows_user_assistant_only():
    coder = _FakeCoder(
        [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
            {"role": "system", "content": "ignored"},
        ],
        [{"role": "user", "content": "again"}],
    )
    rows = transcript_rows_from_coder(coder)
    assert rows == [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
        {"role": "user", "content": "again"},
    ]


def test_transcript_multimodal_text_blocks():
    coder = _FakeCoder(
        [
            {
                "role": "assistant",
                "content": [{"type": "text", "text": "  answer  "}],
            }
        ],
        [],
    )
    rows = transcript_rows_from_coder(coder)
    assert rows == [{"role": "assistant", "content": "answer"}]
