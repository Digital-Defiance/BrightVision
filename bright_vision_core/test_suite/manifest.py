"""Canonical test-suite step list (source of truth for CLI + Test Lab)."""

from __future__ import annotations

import os
import urllib.error
import urllib.request
from dataclasses import dataclass


@dataclass(frozen=True)
class SuiteStep:
    id: str
    label: str
    argv: tuple[str, ...]
    requires_ollama: bool = False
    touches_core_port: bool = False


_BASE_STEPS: tuple[SuiteStep, ...] = (
    SuiteStep("dogfood:check", "yarn dogfood:check", ("yarn", "dogfood:check")),
    SuiteStep(
        "test-local:release",
        "sh scripts/test-local.sh release",
        ("sh", "scripts/test-local.sh", "release"),
        touches_core_port=True,
    ),
    SuiteStep("e2e:fixtures", "yarn test:e2e:fixtures", ("yarn", "test:e2e:fixtures")),
)

# Same files as package.json ``test:llm:core``; suite uses live pytest flags (not ``-q``).
_LLM_CORE_TEST_FILES: tuple[str, ...] = (
    "tests/core/test_hello_llm.py",
    "tests/core/test_agent_llm.py",
    "tests/core/test_context_llm.py",
    "tests/core/test_todo_list_llm.py",
    "tests/core/test_edit_block_llm.py",
    "tests/core/test_transcript_llm.py",
    "tests/core/test_generate_spec_llm.py",
    "tests/core/test_generate_spec_parse.py",
    "tests/core/test_http_generate_spec_mock.py",
)


def llm_core_pytest_argv() -> tuple[str, ...]:
    return (
        ".venv/bin/python3",
        "-m",
        "pytest",
        *_LLM_CORE_TEST_FILES,
        "-v",
        "-s",
        "--tb=short",
    )


def llm_core_step_env(*, suite_run: bool = False) -> dict[str, str]:
    """Env for suite ``llm:core``.

    When ``suite_run=True`` (Test Lab / ``yarn test:everything``), use longer
    wall-clock caps than ``yarn test:llm:core`` unless ``BV_SUITE_USE_ENV_TIMEOUTS=1``.
    """
    use_env_timeouts = os.environ.get("BV_SUITE_USE_ENV_TIMEOUTS") == "1"
    in_suite = suite_run or os.environ.get("BV_TEST_SUITE_ACTIVE") == "1"
    # Suite: long turn cap; agent preproc uncapped (product default) so /agent is not
    # killed at 900s while Ollama is still retrying; slash keeps a separate cap.
    suite_turn, suite_agent, suite_slash = "1200", "0", "360"
    cli_turn, cli_agent, cli_slash = "600", "0", "300"
    pick_turn = suite_turn if in_suite else cli_turn
    pick_agent = suite_agent if in_suite else cli_agent
    pick_slash = suite_slash if in_suite else cli_slash

    def _timeout(key: str, default: str) -> str:
        if suite_run and not use_env_timeouts:
            return default
        return os.environ.get(key, default)

    return {
        "PYTHONSAFEPATH": "1",
        "PYTHONUNBUFFERED": "1",
        "VISION_AGENT_PREPROC_TIMEOUT_S": _timeout(
            "VISION_AGENT_PREPROC_TIMEOUT_S", pick_agent
        ),
        "VISION_SLASH_PREPROC_TIMEOUT_S": _timeout(
            "VISION_SLASH_PREPROC_TIMEOUT_S", pick_slash
        ),
        "LLM_TEST_TURN_TIMEOUT_S": _timeout("LLM_TEST_TURN_TIMEOUT_S", pick_turn),
        "LLM_SPEC_GEN_TURN_TIMEOUT_S": _timeout(
            "LLM_SPEC_GEN_TURN_TIMEOUT_S", "1200" if in_suite else "900"
        ),
        "LLM_SPEC_GEN_TIMEOUT_S": _timeout(
            "LLM_SPEC_GEN_TIMEOUT_S", "1200" if in_suite else "900"
        ),
        "E2E_OLLAMA_MODEL": os.environ.get("E2E_OLLAMA_MODEL", "ollama_chat/llama3.2:3b"),
        "E2E_LLM": "1",
        "BV_TEST_SUITE_LIVE_OUTPUT": "1",
    }


_LLM_STEPS: tuple[SuiteStep, ...] = (
    SuiteStep(
        "llm:core",
        "yarn test:llm:core",
        llm_core_pytest_argv(),
        requires_ollama=True,
    ),
    SuiteStep(
        "e2e:llm",
        "E2E_LLM=1 yarn test:e2e:llm",
        ("yarn", "test:e2e:llm"),
        requires_ollama=True,
        touches_core_port=True,
    ),
    SuiteStep(
        "e2e:llm:superproject",
        "E2E_SUPERPROJECT_LLM=1 yarn test:e2e:llm:superproject",
        ("yarn", "test:e2e:llm:superproject"),
        requires_ollama=True,
        touches_core_port=True,
    ),
)


def ollama_reachable() -> bool:
    host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
    try:
        with urllib.request.urlopen(f"{host}/api/tags", timeout=3) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def plan_steps(*, skip_llm: bool = False) -> list[SuiteStep]:
    steps = list(_BASE_STEPS)
    if skip_llm:
        return steps
    if ollama_reachable():
        steps.extend(_LLM_STEPS)
    return steps


def llm_env_defaults() -> dict[str, str]:
    return {
        "VISION_AGENT_PREPROC_TIMEOUT_S": os.environ.get(
            "VISION_AGENT_PREPROC_TIMEOUT_S", "600"
        ),
        "VISION_SLASH_PREPROC_TIMEOUT_S": os.environ.get(
            "VISION_SLASH_PREPROC_TIMEOUT_S", "300"
        ),
        "LLM_TEST_TURN_TIMEOUT_S": os.environ.get("LLM_TEST_TURN_TIMEOUT_S", "300"),
        "E2E_LLM": "1",
    }
