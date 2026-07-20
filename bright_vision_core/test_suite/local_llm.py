"""Local LLM backend detection for Test Lab (Ollama vs LM Studio)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

from bright_vision_core.test_suite.timing import repo_root

DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434"
DEFAULT_LMSTUDIO_HOST = "http://127.0.0.1:1234"
DEFAULT_SUITE_OLLAMA_MODEL = "ollama_chat/llama3.2:3b"
DEFAULT_SUITE_LMSTUDIO_MODEL = "openai/llama-3.2-3b-instruct"

# Router e2e validates tier *routing*, not model quality — keep tiers small and distinct.
DEFAULT_SUITE_ROUTER_FAST_OLLAMA = "llama3.2:3b"
DEFAULT_SUITE_ROUTER_CODE_OLLAMA = "qwen2.5-coder:7b"
DEFAULT_SUITE_ROUTER_THINK_OLLAMA = "llama3.2:1b"
DEFAULT_SUITE_ROUTER_FAST_LMSTUDIO = "llama-3.2-3b-instruct"
DEFAULT_SUITE_ROUTER_CODE_LMSTUDIO = "qwen2.5-coder-7b-instruct"
DEFAULT_SUITE_ROUTER_THINK_LMSTUDIO = "llama-3.2-1b-instruct"


def load_local_llm_env_file() -> dict[str, str]:
    """Parse repo ``local-llm.env`` (and ``LOCAL_LLM_ENV`` when set)."""
    paths = [
        repo_root() / "local-llm.env",
        Path(os.environ.get("LOCAL_LLM_ENV", "")).expanduser(),
    ]
    out: dict[str, str] = {}
    for path in paths:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            trimmed = line.strip()
            if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
                continue
            key, _, value = trimmed.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                out[key] = value
    return out


def resolve_backend() -> str:
    raw = os.environ.get("BRIGHTVISION_LLM_BACKEND", "").strip()
    if not raw:
        raw = load_local_llm_env_file().get("BRIGHTVISION_LLM_BACKEND", "").strip()
    return (raw or "lmstudio").lower()


def strip_local_model_tag(raw: str) -> str:
    tag = (raw or "").strip()
    for prefix in ("openai/", "ollama_chat/", "ollama/"):
        if tag.startswith(prefix):
            return tag[len(prefix) :]
    return tag


def lmstudio_api_base() -> str:
    file_env = load_local_llm_env_file()
    host = (
        os.environ.get("BRIGHTVISION_LLM_BACKEND_URL", "").strip()
        or os.environ.get("OLLAMA_HOST", "").strip()
        or file_env.get("BRIGHTVISION_LLM_BACKEND_URL", "").strip()
        or file_env.get("OLLAMA_HOST", "").strip()
        or DEFAULT_LMSTUDIO_HOST
    ).rstrip("/")
    explicit = os.environ.get("OPENAI_API_BASE", "").strip() or file_env.get(
        "OPENAI_API_BASE", ""
    ).strip()
    if explicit:
        return explicit.rstrip("/")
    return f"{host}/v1"


def lmstudio_core_env() -> dict[str, str]:
    """Env vars pytest / Playwright need for LiteLLM → LM Studio OpenAI API."""
    file_env = load_local_llm_env_file()
    host = (
        os.environ.get("BRIGHTVISION_LLM_BACKEND_URL", "").strip()
        or file_env.get("BRIGHTVISION_LLM_BACKEND_URL", "").strip()
        or DEFAULT_LMSTUDIO_HOST
    ).rstrip("/")
    api_base = lmstudio_api_base()
    api_key = (
        os.environ.get("OPENAI_API_KEY", "").strip()
        or file_env.get("OPENAI_API_KEY", "").strip()
        or "lm-studio"
    )
    out = {
        "BRIGHTVISION_LLM_BACKEND": "lmstudio",
        "BRIGHTVISION_LLM_BACKEND_URL": host,
        "OPENAI_API_BASE": api_base,
        "OPENAI_API_KEY": api_key,
    }
    if not os.environ.get("OLLAMA_HOST", "").strip():
        out["OLLAMA_HOST"] = host
    return out


def default_suite_e2e_model(backend: str | None = None) -> str:
    name = (backend or resolve_backend()).lower()
    if name == "lmstudio":
        file_env = load_local_llm_env_file()
        data = (
            os.environ.get("DATA_MODEL", "").strip()
            or file_env.get("DATA_MODEL", "").strip()
            or strip_local_model_tag(
                os.environ.get("E2E_OLLAMA_MODEL", "")
                or file_env.get("E2E_OLLAMA_MODEL", "")
            )
        )
        if data:
            return data if data.startswith("openai/") else f"openai/{data}"
        return DEFAULT_SUITE_LMSTUDIO_MODEL
    return DEFAULT_SUITE_OLLAMA_MODEL


def default_suite_router_tags(backend: str | None = None) -> tuple[str, str, str]:
    """Small distinct tier tags for ``e2e:llm:router`` (Test Lab pins unless opted out)."""
    name = (backend or resolve_backend()).lower()
    if name == "lmstudio":
        return (
            DEFAULT_SUITE_ROUTER_FAST_LMSTUDIO,
            DEFAULT_SUITE_ROUTER_CODE_LMSTUDIO,
            DEFAULT_SUITE_ROUTER_THINK_LMSTUDIO,
        )
    return (
        DEFAULT_SUITE_ROUTER_FAST_OLLAMA,
        DEFAULT_SUITE_ROUTER_CODE_OLLAMA,
        DEFAULT_SUITE_ROUTER_THINK_OLLAMA,
    )


def resolve_suite_code_model_tag(backend: str | None = None) -> str:
    """CODE-tier tag for implement/agent LLM lanes (``local-llm.env`` or suite default)."""
    file_env = load_local_llm_env_file()
    code = (
        os.environ.get("CODE_MODEL", "").strip()
        or os.environ.get("HEAVY_MODEL", "").strip()
        or file_env.get("CODE_MODEL", "").strip()
        or file_env.get("HEAVY_MODEL", "").strip()
    )
    if not code:
        _, code, _ = default_suite_router_tags(backend)
    return strip_local_model_tag(code)


def implement_heavy_code_model(code: str) -> bool:
    """Large CODE-tier models need longer implement-turn caps in Lab."""
    low = (code or "").lower()
    return any(marker in low for marker in ("27b", "32b", "70b", "qwen3.6"))


def implement_lane_turn_timeout_s(code_model: str, *, base: str = "600") -> str | None:
    if not implement_heavy_code_model(code_model):
        return None
    try:
        return str(max(int(float(base)), 1200))
    except ValueError:
        return "1200"


def implement_lane_step_env(*, suite_run: bool = False) -> dict[str, str]:
    """Pin CODE tier for implement LLM e2e/pytest when Test Lab runs LLM steps."""
    in_suite = suite_run or os.environ.get("BV_TEST_SUITE_ACTIVE") == "1"
    if not in_suite or os.environ.get("BV_SUITE_USE_ENV_MODEL") == "1":
        return {}
    env: dict[str, str] = {}
    code = (
        os.environ.get("E2E_CODE_MODEL", "").strip()
        or os.environ.get("E2E_HEAVY_MODEL", "").strip()
    )
    if not code:
        code = resolve_suite_code_model_tag()
        env["E2E_CODE_MODEL"] = code
    cap = implement_lane_turn_timeout_s(code)
    if cap:
        env["BV_SUITE_LLM_TURN_TIMEOUT_S"] = cap
    return env


def _suite_litellm_no_retry_params() -> str:
    """Cap LiteLLM retries so LM Studio 5xx does not burn the turn cap."""
    import json

    raw = os.environ.get("LITELLM_EXTRA_PARAMS", "").strip()
    params: dict[str, object] = {}
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                params = parsed
        except json.JSONDecodeError:
            pass
    params["num_retries"] = 0
    return json.dumps(params)


def eval_prompts_step_env(*, suite_run: bool = False) -> dict[str, str]:
    """Fast-tier model for behavioral prompt eval (before heavy llm:core / implement)."""
    in_suite = suite_run or os.environ.get("BV_TEST_SUITE_ACTIVE") == "1"
    use_env_model = os.environ.get("BV_SUITE_USE_ENV_MODEL") == "1"
    backend = resolve_backend()
    fast = (
        os.environ.get("E2E_OLLAMA_MODEL", "").strip()
        if use_env_model
        else default_suite_e2e_model(backend)
    )
    turn_cap = "240" if in_suite else "600"
    env: dict[str, str] = {
        "PYTHONSAFEPATH": "1",
        "PYTHONUNBUFFERED": "1",
        "E2E_LLM": "1",
        "VISION_AGENT_PREPROC_TIMEOUT_S": "0",
        "LLM_TEST_TURN_TIMEOUT_S": turn_cap,
        "E2E_OLLAMA_MODEL": fast,
        "LITELLM_EXTRA_PARAMS": _suite_litellm_no_retry_params(),
    }
    if backend == "lmstudio":
        env.update(lmstudio_core_env())
        if in_suite:
            env["LMS_WARMUP_RESTART_SERVER"] = "1"
    if in_suite:
        env["BV_TEST_SUITE_ACTIVE"] = "1"
        env["BV_TEST_SUITE_LIVE_OUTPUT"] = "1"
        env["BV_EVAL_PROMPTS_SOFT"] = "1"
    return env


def router_lane_step_env(*, suite_run: bool = False) -> dict[str, str]:
    """Pin small router tier models in suite (same opt-out as ``llm_core_step_env``)."""
    in_suite = suite_run or os.environ.get("BV_TEST_SUITE_ACTIVE") == "1"
    if not in_suite or os.environ.get("BV_SUITE_USE_ENV_MODEL") == "1":
        return {}
    fast, code, think = default_suite_router_tags()
    env: dict[str, str] = {}
    if not os.environ.get("E2E_FAST_MODEL", "").strip():
        env["E2E_FAST_MODEL"] = fast
    if not os.environ.get("E2E_CODE_MODEL", "").strip() and not os.environ.get(
        "E2E_HEAVY_MODEL", ""
    ).strip():
        env["E2E_CODE_MODEL"] = code
    if not os.environ.get("E2E_THINK_MODEL", "").strip():
        env["E2E_THINK_MODEL"] = think
    return env


def ollama_reachable() -> bool:
    host = (
        os.environ.get("OLLAMA_HOST", "").strip()
        or load_local_llm_env_file().get("OLLAMA_HOST", "").strip()
        or DEFAULT_OLLAMA_HOST
    ).rstrip("/")
    try:
        with urllib.request.urlopen(f"{host}/api/tags", timeout=3) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def lmstudio_reachable() -> bool:
    if shutil.which("lms"):
        try:
            proc = subprocess.run(
                ["lms", "ls", "--json"],
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
            if proc.returncode == 0:
                return True
        except (OSError, subprocess.TimeoutExpired):
            pass
    base = lmstudio_api_base().rstrip("/")
    if base.endswith("/v1"):
        url = f"{base}/models"
    else:
        url = f"{base}/v1/models"
    try:
        req = urllib.request.Request(url, headers={"Authorization": "Bearer lm-studio"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def local_llm_reachable() -> bool:
    if resolve_backend() == "lmstudio":
        return lmstudio_reachable()
    return ollama_reachable()


def fetch_lmstudio_model_keys() -> list[str]:
    if not shutil.which("lms"):
        return []
    try:
        proc = subprocess.run(
            ["lms", "ls", "--json"],
            capture_output=True,
            text=True,
            timeout=20,
            check=True,
        )
        rows = json.loads(proc.stdout or "[]")
        if not isinstance(rows, list):
            return []
        keys: list[str] = []
        for row in rows:
            if not isinstance(row, dict) or row.get("type") != "llm":
                continue
            key = row.get("modelKey")
            if isinstance(key, str) and key.strip():
                keys.append(key.strip())
        return keys
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError, subprocess.CalledProcessError):
        return []
