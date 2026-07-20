"""Make sibling modules (e.g. llm_ollama.py) importable in this directory."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

_CORE_DIR = Path(__file__).resolve().parent
if str(_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(_CORE_DIR))

_BROWSER_PATCHED = False


def _should_block_browser_tabs() -> bool:
    return os.environ.get("BV_TEST_SUITE_ACTIVE") == "1" or os.environ.get("E2E_LLM") == "1"


def _patch_webbrowser_open_globally() -> None:
    global _BROWSER_PATCHED
    if _BROWSER_PATCHED or not _should_block_browser_tabs():
        return

    def _noop(*_args: object, **_kwargs: object) -> None:
        return None

    import webbrowser

    webbrowser.open = _noop  # type: ignore[method-assign]
    # Older cecli bound webbrowser on cecli.io; rc6+ imports it inside methods.
    # Patching the stdlib module still covers those local imports.
    try:
        import cecli.io as cecli_io

        if hasattr(cecli_io, "webbrowser"):
            cecli_io.webbrowser.open = _noop  # type: ignore[attr-defined]
    except ImportError:
        pass
    _BROWSER_PATCHED = True


def pytest_configure(config: pytest.Config) -> None:
    _patch_webbrowser_open_globally()
    if os.environ.get("E2E_LLM") == "1":
        try:
            from bright_vision_core.test_suite.local_llm import (
                lmstudio_core_env,
                resolve_backend,
            )

            if resolve_backend() == "lmstudio":
                for key, value in lmstudio_core_env().items():
                    os.environ.setdefault(key, value)
        except ImportError:
            pass
        try:
            from bright_vision_core.test_suite.manifest import _suite_litellm_extra_params

            os.environ.setdefault("LITELLM_EXTRA_PARAMS", _suite_litellm_extra_params())
        except ImportError:
            pass


@pytest.fixture(autouse=True)
def _isolate_git_from_identity_hooks(
    monkeypatch: pytest.MonkeyPatch, tmp_path_factory: pytest.TempPathFactory
) -> None:
    """Keep test ``git commit`` away from ~/.gitconfig ``core.hooksPath`` identity hooks."""
    empty_template = tmp_path_factory.mktemp("git-empty-template")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", os.devnull)
    monkeypatch.setenv("GIT_CONFIG_SYSTEM", os.devnull)
    monkeypatch.setenv("GIT_TEMPLATE_DIR", str(empty_template))
    # Committer identity when local repo config is unset (after blanking global).
    monkeypatch.setenv("GIT_AUTHOR_NAME", "BrightVision Test")
    monkeypatch.setenv("GIT_AUTHOR_EMAIL", "test@brightvision.local")
    monkeypatch.setenv("GIT_COMMITTER_NAME", "BrightVision Test")
    monkeypatch.setenv("GIT_COMMITTER_EMAIL", "test@brightvision.local")


@pytest.fixture(autouse=True)
def _no_cecli_browser_tabs(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prevent cecli from opening token-limit docs in the browser during suite runs."""
    if not _should_block_browser_tabs():
        return

    def _noop(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr("webbrowser.open", _noop)
    try:
        import cecli.io as cecli_io

        if hasattr(cecli_io, "webbrowser"):
            monkeypatch.setattr("cecli.io.webbrowser.open", _noop)
    except ImportError:
        pass


def _live_progress_stderr() -> bool:
    """Emit per-test lines for Test Lab / long LLM runs (works with ``-q``)."""
    return (
        os.environ.get("BV_TEST_SUITE_LIVE_OUTPUT") == "1"
        or os.environ.get("E2E_LLM") == "1"
    )


def pytest_runtest_logstart(nodeid: str, location: tuple[str, int, str]) -> None:
    if _live_progress_stderr():
        print(f"START {nodeid}", file=sys.stderr, flush=True)


def pytest_runtest_logreport(report) -> None:
    if not _live_progress_stderr():
        return
    if report.when == "call":
        dur = getattr(report, "duration", 0) or 0
        print(
            f"{report.outcome.upper()} {report.nodeid} ({dur:.1f}s)",
            file=sys.stderr,
            flush=True,
        )
        if report.failed and report.longrepr:
            text = str(report.longrepr)
            snippet = text if len(text) <= 2000 else text[:2000] + "\n…"
            print(f"FAIL: {snippet}", file=sys.stderr, flush=True)


_RECOVER_LLM_AFTER_TEST_FILES = (
    "test_edit_block_llm.py",
    "test_hello_llm.py",
    "test_context_llm.py",
    "test_agent_llm.py",
    "test_todo_list_llm.py",
    "test_transcript_llm.py",
    "test_generate_spec_llm.py",
    "test_implement_llm.py",
)


def _recover_llm_after_test(nodeid: str) -> bool:
    return any(name in nodeid for name in _RECOVER_LLM_AFTER_TEST_FILES)


@pytest.fixture(autouse=True)
def _suite_recover_local_llm_after_heavy_test(request: pytest.FixtureRequest):
    """Between LLM turns in Test Lab, reset LM Studio and Vision session state."""
    yield
    if os.environ.get("BV_TEST_SUITE_ACTIVE") != "1":
        return
    if not _recover_llm_after_test(request.node.nodeid):
        return
    try:
        from llm_ollama import recover_local_llm_for_tests, reset_vision_sessions_for_tests

        reset_vision_sessions_for_tests()
        recover_local_llm_for_tests()
    except Exception:
        pass
