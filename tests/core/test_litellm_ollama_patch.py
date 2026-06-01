"""LiteLLM Ollama tool-argument patch (no live Ollama)."""

from __future__ import annotations

import json
import unittest


class TestLitellmOllamaPatch(unittest.TestCase):
    def test_http_api_import_after_litellm_patch(self):
        import bright_vision_core.http_api as http_api

        self.assertTrue(hasattr(http_api, "app"))

    def test_transform_request_accepts_glued_tool_arguments(self):
        from bright_vision_core.litellm_ollama_patch import apply_litellm_ollama_tool_argument_patch
        from litellm.llms.ollama.chat.transformation import OllamaChatConfig

        apply_litellm_ollama_tool_argument_patch()
        cfg = OllamaChatConfig()
        raw = '{"limit": 15}{}{"path": "."}'
        messages = [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "UpdateTodoList", "arguments": raw},
                    }
                ],
            }
        ]
        cfg.transform_request(
            model="ollama_chat/llama3.2:3b",
            messages=messages,
            optional_params={},
            litellm_params={},
            headers={},
        )
        args = messages[0]["tool_calls"][0]["function"]["arguments"]
        self.assertEqual(args, {"limit": 15, "path": "."})

    def test_parse_loose_matches_cecli_when_available(self):
        from bright_vision_core.litellm_ollama_patch import _parse_tool_arguments_loose

        raw = '{"tasks": [{"task": "x"}]}{}'
        parsed = _parse_tool_arguments_loose(raw)
        self.assertIn("tasks", parsed)


if __name__ == "__main__":
    unittest.main()
