"""HTTP client for LLM pytest against a live Vision API (suite ``llm:core`` on :8741)."""

from __future__ import annotations

from typing import Any

import httpx


class HttpVisionClient:
    """Subset of ``TestClient`` used by ``tests/core/*_llm.py`` and ``llm_client``."""

    def __init__(self, base_url: str) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=httpx.Timeout(None, connect=60.0),
        )

    def post(self, path: str, json: dict[str, Any] | None = None) -> httpx.Response:
        return self._client.post(path, json=json)

    def get(self, path: str) -> httpx.Response:
        return self._client.get(path)

    def stream(self, method: str, path: str, json: dict[str, Any] | None = None):
        return self._client.stream(method, path, json=json)

    def close(self) -> None:
        self._client.close()
