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


def configure_litellm_local_privacy() -> None:
    """Avoid Hugging Face Hub HTTP for LiteLLM token counting (local-first default).

    LiteLLM otherwise downloads public tokenizer files (e.g. ``Xenova/llama-3-tokenizer``)
    when the session model name contains ``llama-3``. That does **not** upload prompts,
    but it does contact huggingface.co without surfacing in Settings. Token counts fall
    back to local tiktoken instead.

    Opt in with ``BV_ALLOW_HF_TOKENIZER=1``.
    """
    if os.environ.get("BV_ALLOW_HF_TOKENIZER", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    ):
        return
    import litellm

    litellm.disable_hf_tokenizer_download = True


def register_litellm_extra_params(*, exclude_think: bool = False) -> dict[str, Any]:
    """
    Merge ``LITELLM_EXTRA_PARAMS`` into cecli ``MODEL_SETTINGS`` as ``cecli/extra_params``.

    When ``exclude_think`` is true (model router enabled), drop ``think`` so hopper/route
    owns per-model thinking — global Settings must not force one value on every model.

    When router is off and ``DATA_THINK=1`` is set, inject ``think: true`` so the
    non-routed DATA_MODEL also uses thinking mode.
    """
    params = parse_litellm_extra_params_env()
    if exclude_think:
        params = {k: v for k, v in params.items() if k != "think"}
    else:
        # Router off — check DATA_THINK for non-routed model think mode
        if "think" not in params:
            data_think = os.environ.get("DATA_THINK", "").strip().lower()
            if data_think in ("1", "true", "yes", "on"):
                params["think"] = True
            elif data_think in ("0", "false", "no", "off"):
                params["think"] = False
    if not params:
        return {}

    from cecli.models import MODEL_SETTINGS, ModelSettings

    MODEL_SETTINGS[:] = [ms for ms in MODEL_SETTINGS if ms.name != _EXTRA_PARAMS_NAME]
    MODEL_SETTINGS.append(ModelSettings(name=_EXTRA_PARAMS_NAME, extra_params=params))
    return params
