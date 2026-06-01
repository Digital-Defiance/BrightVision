"""Minimal argparse-like namespace for headless Vision sessions."""

from __future__ import annotations

import json
from types import SimpleNamespace

# Headless `/agent` — shorter command timeout; cecli still needs Finished tool to exit.
_DEFAULT_AGENT_CONFIG = json.dumps(
    {
        "command_timeout": 45,
        "allow_nested_delegation": False,
    }
)


def default_headless_args(*, yes: bool = False) -> SimpleNamespace:
    """Defaults for ``Coder.create`` when no CLI ``args`` object exists."""
    return SimpleNamespace(
        debug=False,
        verbose=False,
        tui=False,
        yes=yes,
        agent_config=_DEFAULT_AGENT_CONFIG,
        yes_always_commands=False,
        fancy_input=False,
        show_speed=False,
        max_reflections=3,
        custom="{}",
        file_diffs=True,
        cost_limit=float("inf"),
        disable_scraping=True,
        use_enhanced_map=False,
        auto_save=False,
        auto_load=False,
        auto_save_session_name="auto-save",
        session_encrypt=False,
        session_key_file=None,
    )
