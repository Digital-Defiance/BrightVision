"""Vision spawn helpers for suite llm:core."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from bright_vision_core.test_suite.vision_spawn import (
    vision_base_url,
    wait_vision_health,
)


def test_vision_base_url_default_port():
    assert vision_base_url() == "http://127.0.0.1:8741"


def test_wait_vision_health_succeeds():
    resp = MagicMock()
    resp.status = 200
    resp.__enter__ = MagicMock(return_value=resp)
    resp.__exit__ = MagicMock(return_value=False)
    with patch("urllib.request.urlopen", return_value=resp):
        wait_vision_health("http://127.0.0.1:8741", timeout_s=1.0)


def test_create_llm_vision_client_http_mode(monkeypatch):
    monkeypatch.setenv("BV_LLM_PYTEST_VISION_URL", "http://127.0.0.1:8741")
    from llm_client import create_llm_vision_client
    from llm_http_client import HttpVisionClient

    client = create_llm_vision_client()
    assert isinstance(client, HttpVisionClient)
    client.close()
