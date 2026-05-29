"""LLM progress copy for Ollama vs cloud."""

from unittest.mock import MagicMock

from bright_vision_core.llm_progress import llm_wait_messages


def _model(name: str, *, ollama: bool) -> MagicMock:
    m = MagicMock()
    m.name = name
    m.is_ollama.return_value = ollama
    return m


def test_llm_wait_messages_ollama():
    initial, heartbeat = llm_wait_messages(_model("ollama_chat/llama3.2:3b", ollama=True))
    assert "Ollama" in initial
    assert "llama3.2:3b" in initial
    assert heartbeat.startswith("Waiting for Ollama (llama3.2:3b)")


def test_llm_wait_messages_cloud():
    initial, heartbeat = llm_wait_messages(_model("openai/gpt-5.3-chat", ollama=False))
    assert "cloud LLM" in initial
    assert "openai/gpt-5.3-chat" in initial
    assert "Ollama" not in initial
    assert heartbeat.startswith("Waiting for cloud LLM (openai/gpt-5.3-chat)")
