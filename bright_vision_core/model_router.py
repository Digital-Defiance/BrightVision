"""Re-export from cecli.hopper + BrightVision headless env + backend preload hooks."""

from __future__ import annotations

import os

import cecli.hopper.router as _hopper_router
from cecli.hopper.router import *  # noqa: F403,F401
from cecli.hopper.router import ModelRouterConfig as _ModelRouterConfig
from cecli.hopper.router import _strip_ollama_prefix  # noqa: F401 — tests


def _wire_host_preload_hooks() -> None:
    bv_root = os.environ.get("BRIGHT_VISION_ROOT", "").strip()
    if bv_root and not os.environ.get("CECLI_REPO_ROOT", "").strip():
        os.environ["CECLI_REPO_ROOT"] = bv_root

    def _backend_client():
        from bright_vision_core.llm_backends.registry import BackendRegistry

        return BackendRegistry.get_active()

    def _static_vram_bytes(raw_tag: str) -> int | None:
        from bright_vision_core.llm_backends.metadata_resolver import resolve_static_metadata

        meta = resolve_static_metadata(raw_tag)
        mb = meta.get("estimated_vram_mb")
        if isinstance(mb, (int, float)) and mb > 0:
            return int(mb) * 1024 * 1024
        return None

    _hopper_router.set_backend_client_resolver(_backend_client)
    _hopper_router.set_static_vram_bytes_resolver(_static_vram_bytes)


_wire_host_preload_hooks()


class ModelRouterConfig(_ModelRouterConfig):
    """BrightVision shim — adds headless ``BRIGHT_VISION_*`` env parsing."""

    @classmethod
    def from_env(cls) -> ModelRouterConfig | None:
        if os.environ.get("BRIGHT_VISION_MODEL_ROUTER", "").strip() not in (
            "1",
            "true",
            "yes",
            "on",
        ):
            return None
        fast = os.environ.get("BRIGHT_VISION_FAST_MODEL", "").strip()
        if not fast:
            return None
        code = (
            os.environ.get("BRIGHT_VISION_CODE_MODEL", "").strip()
            or os.environ.get("BRIGHT_VISION_HEAVY_MODEL", "").strip()
            or None
        )
        think = os.environ.get("BRIGHT_VISION_THINK_MODEL", "").strip() or None
        return cls(
            enabled=True,
            fast_model=fast,
            heavy_model=code,
            code_model=code,
            think_model=think,
            token_fast_max=int(os.environ.get("BRIGHT_VISION_ROUTER_TOKEN_FAST_MAX", "4096")),
            token_heavy_min=int(os.environ.get("BRIGHT_VISION_ROUTER_TOKEN_HEAVY_MIN", "12000")),
            escalate_on_failure=os.environ.get("BRIGHT_VISION_ROUTER_ESCALATE", "1").strip()
            not in ("0", "false", "no"),
        )
