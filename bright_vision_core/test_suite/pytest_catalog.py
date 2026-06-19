"""Map tests/core modules to suite tiers; compute engine-extra for full coverage."""

from __future__ import annotations

import json
import re
from functools import lru_cache

from bright_vision_core.test_suite.timing import repo_root


@lru_cache(maxsize=1)
def _package_json_scripts() -> dict[str, str]:
    return json.loads((repo_root() / "package.json").read_text(encoding="utf-8"))["scripts"]


def _pytest_paths_in_script(script_name: str) -> frozenset[str]:
    raw = _package_json_scripts().get(script_name, "")
    return frozenset(re.findall(r"tests/core/test_[a-z0-9_]+\.py", raw))


def bright_core_pytest_files() -> frozenset[str]:
    from bright_vision_core.test_suite.manifest import bright_core_implement_test_files

    return _pytest_paths_in_script("test:bright-core") | frozenset(
        bright_core_implement_test_files()
    )


def llm_core_pytest_files() -> frozenset[str]:
    from bright_vision_core.test_suite.manifest import llm_core_test_files

    return frozenset(llm_core_test_files())


def llm_backends_pytest_files() -> frozenset[str]:
    return _pytest_paths_in_script("test:llm-backends")


def cloud_llm_pytest_files() -> frozenset[str]:
    return frozenset({"tests/core/test_cloud_llm_smoke.py"})


def eval_prompts_pytest_files() -> frozenset[str]:
    return frozenset({"tests/core/test_agent_prompt_eval.py"})


def all_core_pytest_files() -> tuple[str, ...]:
    root = repo_root() / "tests" / "core"
    return tuple(
        sorted(
            f"tests/core/{p.name}"
            for p in root.glob("test_*.py")
            if p.is_file()
        )
    )


def engine_extra_pytest_files() -> tuple[str, ...]:
    """tests/core modules not owned by bright-core, llm:core, backends, cloud, or eval."""
    covered = (
        bright_core_pytest_files()
        | llm_core_pytest_files()
        | llm_backends_pytest_files()
        | cloud_llm_pytest_files()
        | eval_prompts_pytest_files()
    )
    return tuple(path for path in all_core_pytest_files() if path not in covered)


def engine_extra_pytest_argv() -> tuple[str, ...]:
    files = engine_extra_pytest_files()
    if not files:
        return (".venv/bin/python3", "-m", "pytest", "-q", "--collect-only")
    return (".venv/bin/python3", "-m", "pytest", *files, "-q")
