"""Load Settings ``LITELLM_EXTRA_PARAMS`` into cecli ``cecli/extra_params``."""

from __future__ import annotations

import json
import os
from typing import Any

_EXTRA_PARAMS_NAME = "cecli/extra_params"


def parse_litellm_extra_params_env() -> dict[str, Any]:
    raw = os.environ.get("LITELLM_EXTRA_PARAMS", "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def register_litellm_extra_params(*, exclude_think: bool = False) -> dict[str, Any]:
    """
    Merge ``LITELLM_EXTRA_PARAMS`` into cecli ``MODEL_SETTINGS`` as ``cecli/extra_params``.

    When ``exclude_think`` is true (model router enabled), drop ``think`` so hopper/route
    owns per-model thinking — global Settings must not force one value on every model.
    """
    params = parse_litellm_extra_params_env()
    if exclude_think:
        params = {k: v for k, v in params.items() if k != "think"}
    if not params:
        return {}

    from cecli.models import MODEL_SETTINGS, ModelSettings

    MODEL_SETTINGS[:] = [ms for ms in MODEL_SETTINGS if ms.name != _EXTRA_PARAMS_NAME]
    MODEL_SETTINGS.append(ModelSettings(name=_EXTRA_PARAMS_NAME, extra_params=params))
    return params
