"""Canonical test-suite step list (source of truth for CLI + Test Lab)."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from bright_vision_core.test_suite.local_llm import (
    default_suite_e2e_model,
    lmstudio_core_env,
    local_llm_reachable,
    resolve_backend,
)


@dataclass(frozen=True)
class SuiteRunOptions:
    """Optional diagnostic lanes (Test Lab checkboxes / CLI flags)."""

    skip_llm: bool = False
    spec_gen_phased: bool = False
    llm_router: bool = False
    cloud_llm: bool = False
    verify_ears: bool = False
    shipped_scenarios: bool = False
    strict_phased_pytest: bool = False


@dataclass(frozen=True)
class SuiteStep:
    id: str
    label: str
    argv: tuple[str, ...]
    requires_ollama: bool = False
    requires_cloud_config: bool = False
    touches_core_port: bool = False


_BASE_STEPS: tuple[SuiteStep, ...] = (
    SuiteStep("dogfood:check", "yarn dogfood:check", ("yarn", "dogfood:check")),
    SuiteStep(
        "verify:cecli-spec",
        "yarn verify:cecli-spec (cecli/tests/spec — progress + EARS)",
        ("yarn", "verify:cecli-spec"),
    ),
    SuiteStep(
        "verify:cecli-hopper",
        "yarn verify:cecli-hopper (cecli/tests/hopper — pool + classify)",
        ("yarn", "verify:cecli-hopper"),
    ),
    SuiteStep(
        "llm:backends",
        "yarn test:llm-backends (config/registry/clients/router — mocked, no vLLM)",
        ("yarn", "test:llm-backends"),
    ),
    SuiteStep(
        "test-local:release",
        "sh scripts/test-local.sh release",
        ("sh", "scripts/test-local.sh", "release"),
        touches_core_port=True,
    ),
    SuiteStep("e2e:fixtures", "yarn test:e2e:fixtures", ("yarn", "test:e2e:fixtures")),
)

# Same files as package.json ``test:llm:core``; suite uses live pytest flags (not ``-q``).
# Edit-block first while the process is clean and LM Studio is warm from suite warmup.
# Hello's in-process TestClient stream can wedge the next Vision SSE turn on LM Studio.
# Spec-gen runs early (before context/agent) while the model is still loaded.
_LLM_CORE_TEST_FILES: tuple[str, ...] = (
    "tests/core/test_edit_block_llm.py",
    "tests/core/test_hello_llm.py",
    "tests/core/test_generate_spec_llm.py",
    # Context before /agent — agent tool loops can leave LM Studio returning 400/empty.
    "tests/core/test_context_llm.py",
    "tests/core/test_agent_llm.py",
    "tests/core/test_todo_list_llm.py",
    "tests/core/test_transcript_llm.py",
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


def _suite_litellm_extra_params() -> str:
    """Cap LiteLLM retries in suite so LM Studio 5xx does not burn the 20m turn cap."""
    raw = os.environ.get("LITELLM_EXTRA_PARAMS", "").strip()
    params: dict[str, object] = {}
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                params = parsed
        except json.JSONDecodeError:
            pass
    params.setdefault("num_retries", 0)
    return json.dumps(params)


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

    def _spec_gen_timeout(key: str, suite_default: str) -> str:
        """In suite, never run spec-gen below ``suite_default`` (even with env overrides)."""
        cli_default = "900"
        pick = suite_default if in_suite else cli_default
        raw = _timeout(key, pick)
        if not in_suite:
            return raw
        try:
            return str(max(int(float(raw)), int(float(suite_default))))
        except ValueError:
            return suite_default

    use_env_model = os.environ.get("BV_SUITE_USE_ENV_MODEL") == "1"
    backend = resolve_backend()
    if in_suite and not use_env_model:
        e2e_model = default_suite_e2e_model(backend)
    else:
        e2e_model = os.environ.get(
            "E2E_OLLAMA_MODEL", default_suite_e2e_model(backend)
        )

    env: dict[str, str] = {
        "PYTHONSAFEPATH": "1",
        "PYTHONUNBUFFERED": "1",
        "VISION_AGENT_PREPROC_TIMEOUT_S": _timeout(
            "VISION_AGENT_PREPROC_TIMEOUT_S", pick_agent
        ),
        "VISION_SLASH_PREPROC_TIMEOUT_S": _timeout(
            "VISION_SLASH_PREPROC_TIMEOUT_S", pick_slash
        ),
        "LLM_TEST_TURN_TIMEOUT_S": _timeout("LLM_TEST_TURN_TIMEOUT_S", pick_turn),
        "BV_SUITE_LLM_TURN_TIMEOUT_S": _timeout("BV_SUITE_LLM_TURN_TIMEOUT_S", "300" if in_suite else pick_turn),
        "BV_COMPACT_SPEC_GEN": os.environ.get("BV_COMPACT_SPEC_GEN", "1"),
        "LLM_SPEC_GEN_TURN_TIMEOUT_S": _spec_gen_timeout(
            "LLM_SPEC_GEN_TURN_TIMEOUT_S", "3600" if in_suite else "900"
        ),
        "LLM_SPEC_GEN_TIMEOUT_S": _spec_gen_timeout(
            "LLM_SPEC_GEN_TIMEOUT_S", "3600" if in_suite else "900"
        ),
        "E2E_OLLAMA_MODEL": e2e_model,
        "E2E_LLM": "1",
        "OLLAMA_WARMUP_EXCLUSIVE": os.environ.get("OLLAMA_WARMUP_EXCLUSIVE", "1"),
        "BV_TEST_SUITE_LIVE_OUTPUT": "1",
        "BV_TEST_SUITE_ACTIVE": "1" if in_suite else os.environ.get("BV_TEST_SUITE_ACTIVE", ""),
    }
    if backend == "lmstudio":
        env.update(lmstudio_core_env())
    if in_suite:
        env.setdefault("LITELLM_EXTRA_PARAMS", _suite_litellm_extra_params())
        try:
            turn_cap = float(env.get("BV_SUITE_LLM_TURN_TIMEOUT_S", "300"))
            env.setdefault("BV_LLM_GPU_STALL_ABORT_S", str(int(max(360.0, turn_cap + 60.0))))
        except ValueError:
            env.setdefault("BV_LLM_GPU_STALL_ABORT_S", "360")
    return env


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

_OPTIONAL_LLM_ROUTER = SuiteStep(
    "e2e:llm:router",
    "yarn test:e2e:llm:router",
    ("yarn", "test:e2e:llm:router"),
    requires_ollama=True,
    touches_core_port=True,
)

_OPTIONAL_CLOUD_LLM = SuiteStep(
    "cloud-llm",
    "yarn test:cloud-llm",
    ("yarn", "test:cloud-llm"),
    requires_cloud_config=True,
)

_OPTIONAL_VERIFY_EARS = SuiteStep(
    "verify:ears",
    "yarn verify:ears (cecli/tests/spec + HTTP EARS/steering)",
    ("yarn", "verify:ears"),
)

_OPTIONAL_SHIPPED_SCENARIOS = SuiteStep(
    "e2e:shipped-scenarios",
    "yarn test:e2e shipped-scenarios",
    ("yarn", "test:e2e", "shipped-scenarios"),
)


def plan_steps(
    *,
    skip_llm: bool = False,
    options: SuiteRunOptions | None = None,
) -> list[SuiteStep]:
    opts = options or SuiteRunOptions()
    effective_skip_llm = skip_llm or opts.skip_llm
    steps = list(_BASE_STEPS)
    if not effective_skip_llm and local_llm_reachable():
        steps.extend(_LLM_STEPS)
    if opts.llm_router and not effective_skip_llm and local_llm_reachable():
        steps.append(_OPTIONAL_LLM_ROUTER)
    if opts.cloud_llm:
        steps.append(_OPTIONAL_CLOUD_LLM)
    if opts.verify_ears:
        steps.append(_OPTIONAL_VERIFY_EARS)
    if opts.shipped_scenarios:
        steps.append(_OPTIONAL_SHIPPED_SCENARIOS)
    return steps


def ollama_reachable() -> bool:
    """Backward-compatible alias for ``local_llm_reachable()``."""
    return local_llm_reachable()


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
