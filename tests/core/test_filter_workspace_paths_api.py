"""POST /workspaces/filter-paths."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from bright_vision_core.http_api import app


@pytest.fixture
def client():
    return TestClient(app)


def test_filter_workspace_paths(client: TestClient, tmp_path: Path):
    f = tmp_path / "README.md"
    f.write_text("hi\n", encoding="utf-8")
    res = client.post(
        f"/workspaces/filter-paths?workspace={tmp_path}",
        json={"paths": ["README.md", "nope.txt"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["existing"] == ["README.md"]
    assert data["missing"] == ["nope.txt"]
