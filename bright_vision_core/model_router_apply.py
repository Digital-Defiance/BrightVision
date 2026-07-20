"""Re-export from cecli.hopper.apply (BrightVision compatibility shim)."""

from cecli import models  # noqa: F401 — unittest.mock patch path
from cecli.hopper.apply import (  # noqa: F401
    apply_hopper_extra_params,
    apply_route_to_coder,
    apply_thinking_extra_params,
    merge_extra_params,
)

__all__ = [
    "apply_hopper_extra_params",
    "apply_route_to_coder",
    "apply_thinking_extra_params",
    "merge_extra_params",
    "models",
]
