"""Headless session args — fields cecli expects when Vision spawns coders."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from bright_vision_core.headless_args import default_headless_args

# Keep in sync with bright_vision_core/headless_args.py (agent mode reads several).
_HEADLESS_ATTRS = (
    "debug",
    "verbose",
    "tui",
    "yes",
    "yes_always_commands",
    "fancy_input",
    "show_speed",
    "max_reflections",
    "custom",
    "file_diffs",
    "cost_limit",
    "disable_scraping",
    "use_enhanced_map",
    "agent_config",
    "auto_save",
    "auto_load",
    "auto_save_session_name",
    "session_encrypt",
    "session_key_file",
)


def test_default_headless_args_exposes_required_fields():
    args = default_headless_args()
    for name in _HEADLESS_ATTRS:
        assert hasattr(args, name), f"missing headless arg: {name}"


def test_default_headless_args_verbose_defaults_false():
    args = default_headless_args()
    assert args.verbose is False


def test_default_headless_args_yes_flag():
    assert default_headless_args(yes=False).yes is False
    assert default_headless_args(yes=True).yes is True


def test_default_headless_args_includes_agent_config_json():
    args = default_headless_args()
    parsed = json.loads(args.agent_config)
    assert isinstance(parsed, dict)
    assert "command_timeout" in parsed


def test_default_headless_args_returns_fresh_namespace():
    a = default_headless_args()
    b = default_headless_args()
    assert a is not b
    a.verbose = True
    assert b.verbose is False


@pytest.mark.asyncio
async def test_agent_coder_mcp_init_fails_without_verbose():
    """Regression: Vision used to omit verbose and /agent crashed in initialize_mcp_tools."""
    pytest.importorskip("cecli")
    from cecli.coders.agent_coder import AgentCoder
    from cecli.io import InputOutput
    from cecli.models import Model

    io = InputOutput(pretty=False, fancy_input=False, yes=True)
    bad_args = SimpleNamespace(debug=False, tui=False, yes=True)
    coder = AgentCoder(
        main_model=Model("gpt-3.5-turbo"),
        io=io,
        repo=None,
        fnames=[],
        args=bad_args,
    )

    with pytest.raises(AttributeError, match="verbose"):
        await coder.initialize_mcp_tools()
