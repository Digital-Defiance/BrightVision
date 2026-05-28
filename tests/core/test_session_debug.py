"""Session debug export bundle."""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace

from bright_vision_core.event_io import EventIO
from bright_vision_core.session_debug import build_session_debug_export


class TestSessionDebugExport(unittest.TestCase):
    def test_build_includes_tool_calls_and_duplicate_hints(self):
        coder = SimpleNamespace(
            root="/tmp/ws",
            main_model=SimpleNamespace(name="ollama_chat/test"),
            stream=True,
            agent_mode=True,
            done_messages=[],
            cur_messages=[
                {"role": "user", "content": "/agent what's next?"},
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call-1",
                            "type": "function",
                            "function": {
                                "name": "GitLog",
                                "arguments": '{"limit": 10}',
                            },
                        },
                        {
                            "id": "call-2",
                            "type": "function",
                            "function": {
                                "name": "GitLog",
                                "arguments": '{"limit": 10}',
                            },
                        },
                    ],
                },
                {
                    "role": "tool",
                    "tool_call_id": "call-1",
                    "content": "Error: duplicate",
                },
            ],
        )
        coder.get_inchat_relative_files = lambda: ["docs/ROADMAP.md"]

        io = EventIO(yes=True)
        io.emit("tool_output", text="Tool Call: Local • GitLog")
        session = SimpleNamespace(coder=coder, io=io, _last_route=None)

        payload = build_session_debug_export("sess-abc", session)
        self.assertEqual(payload["format"], "brightvision-session-debug-v1")
        self.assertEqual(payload["session_id"], "sess-abc")
        self.assertEqual(len(payload["tool_invocations"]), 3)
        self.assertGreaterEqual(len(payload["duplicate_tool_call_hints"]), 1)
        self.assertGreaterEqual(len(payload["recent_io_events"]), 1)

        text = json.dumps(payload)
        self.assertIn("GitLog", text)
