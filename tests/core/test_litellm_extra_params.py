"""LITELLM_EXTRA_PARAMS env → cecli/extra_params."""

from __future__ import annotations

import json

from cecli.models import MODEL_SETTINGS

from bright_vision_core.litellm_extra_params import (
    parse_litellm_extra_params_env,
    register_litellm_extra_params,
)


def test_parse_litellm_extra_params_env_empty(monkeypatch):
    monkeypatch.delenv("LITELLM_EXTRA_PARAMS", raising=False)
    assert parse_litellm_extra_params_env() == {}


def test_register_excludes_think_when_router_on(monkeypatch):
    monkeypatch.setenv("LITELLM_EXTRA_PARAMS", json.dumps({"think": False, "top_p": 0.9}))
    before = len(MODEL_SETTINGS)
    params = register_litellm_extra_params(exclude_think=True)
    assert params == {"top_p": 0.9}
    extra = next(ms for ms in MODEL_SETTINGS if ms.name == "cecli/extra_params")
    assert "think" not in (extra.extra_params or {})
    assert extra.extra_params["top_p"] == 0.9
    MODEL_SETTINGS[:] = MODEL_SETTINGS[:before]


def test_register_keeps_think_without_router(monkeypatch):
    monkeypatch.setenv("LITELLM_EXTRA_PARAMS", json.dumps({"think": False}))
    before = len(MODEL_SETTINGS)
    register_litellm_extra_params(exclude_think=False)
    extra = next(ms for ms in MODEL_SETTINGS if ms.name == "cecli/extra_params")
    assert extra.extra_params["think"] is False
    MODEL_SETTINGS[:] = MODEL_SETTINGS[:before]
