"""Shared local LLM setup for E2E_LLM=1 pytest (Ollama or LM Studio)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.error
import urllib.request

DEFAULT_E2E_OLLAMA_MODEL = "ollama_chat/llama3.2:3b"
DEFAULT_E2E_LMSTUDIO_MODEL = "openai/llama-3.2-3b-instruct"
DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434"
DEFAULT_LMSTUDIO_HOST = "http://127.0.0.1:1234"


def _resolve_backend() -> str:
    try:
        from bright_vision_core.test_suite.local_llm import resolve_backend

        return resolve_backend()
    except ImportError:
        return (os.environ.get("BRIGHTVISION_LLM_BACKEND") or "ollama").strip().lower()


def _ollama_host() -> str:
    return (
        os.environ.get("E2E_OLLAMA_HOST")
        or os.environ.get("OLLAMA_HOST")
        or DEFAULT_OLLAMA_HOST
    ).rstrip("/")


def _lmstudio_host() -> str:
    return (
        os.environ.get("BRIGHTVISION_LLM_BACKEND_URL")
        or os.environ.get("OLLAMA_HOST")
        or DEFAULT_LMSTUDIO_HOST
    ).rstrip("/")


def _auto_pull_enabled() -> bool:
    v = (os.environ.get("E2E_OLLAMA_AUTO_PULL") or "").strip().lower()
    return v not in ("0", "false", "no")


def _strip_model_prefix(model: str) -> str:
    m = model.strip()
    for prefix in ("ollama_chat/", "ollama/", "openai/"):
        if m.startswith(prefix):
            return m[len(prefix) :]
    return m


def _strip_ollama_prefix(model: str) -> str:
    return _strip_model_prefix(model)


def _default_e2e_model() -> str:
    if _resolve_backend() == "lmstudio":
        return DEFAULT_E2E_LMSTUDIO_MODEL
    return DEFAULT_E2E_OLLAMA_MODEL


def resolve_ollama_tag() -> str:
    explicit = (os.environ.get("E2E_OLLAMA_MODEL") or "").strip()
    if explicit:
        return _strip_model_prefix(explicit)
    if (
        os.environ.get("BV_TEST_SUITE_ACTIVE") == "1"
        and os.environ.get("BV_SUITE_USE_ENV_MODEL") != "1"
    ):
        return _strip_model_prefix(_default_e2e_model())
    for key in ("DATA_MODEL", "LLM_MODEL", "CHAT_MODEL"):
        raw = (os.environ.get(key) or "").strip()
        if raw:
            return _strip_model_prefix(raw)
    return _strip_model_prefix(_default_e2e_model())


def vision_model_from_tag(tag: str) -> str:
    from llm_model_resolve import normalize_vision_model_for_e2e

    return normalize_vision_model_for_e2e(tag, backend=_resolve_backend())


def resolve_vision_model() -> str:
    explicit = (
        os.environ.get("E2E_VISION_MODEL") or os.environ.get("E2E_OLLAMA_MODEL") or ""
    ).strip()
    if explicit:
        return vision_model_from_tag(explicit)
    return vision_model_from_tag(resolve_ollama_tag())


def fetch_ollama_tag_names(host: str | None = None) -> list[str]:
    base = host or _ollama_host()
    req = urllib.request.Request(f"{base}/api/tags")
    with urllib.request.urlopen(req, timeout=15) as res:
        body = json.loads(res.read().decode("utf-8"))
    names: list[str] = []
    for entry in body.get("models") or []:
        for key in ("name", "model"):
            val = entry.get(key)
            if isinstance(val, str) and val:
                names.append(val)
    return names


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
    except (
        OSError,
        subprocess.TimeoutExpired,
        json.JSONDecodeError,
        subprocess.CalledProcessError,
    ):
        return []


def is_tag_pulled(names: list[str], tag: str) -> bool:
    return any(n == tag or n.startswith(f"{tag}:") for n in names)


def ollama_pull(tag: str) -> None:
    print(f"[llm e2e] ollama pull {tag}…", flush=True)
    subprocess.run(["ollama", "pull", tag], check=True)


def ensure_ollama_model_pulled(tag: str | None = None) -> str:
    """Return resolved tag; pull with `ollama pull` when missing (unless E2E_OLLAMA_AUTO_PULL=0)."""
    resolved = tag or resolve_ollama_tag()
    host = _ollama_host()
    names = fetch_ollama_tag_names(host)
    if is_tag_pulled(names, resolved):
        return resolved
    if not _auto_pull_enabled():
        raise RuntimeError(
            f'Model "{resolved}" is not pulled. Run: ollama pull {resolved}\n'
            f"Or set E2E_OLLAMA_AUTO_PULL=1 (default) to pull automatically."
        )
    ollama_pull(resolved)
    names = fetch_ollama_tag_names(host)
    if not is_tag_pulled(names, resolved):
        raise RuntimeError(
            f"ollama pull {resolved} finished but model still missing from /api/tags"
        )
    return resolved


def ensure_lmstudio_model_available(tag: str | None = None) -> str:
    """Return resolved LM Studio modelKey; model must already be on disk."""
    resolved = tag or resolve_ollama_tag()
    keys = fetch_lmstudio_model_keys()
    if resolved in keys:
        return resolved
    if not _auto_pull_enabled():
        raise RuntimeError(
            f'Model "{resolved}" is not installed in LM Studio. '
            f"Download it in the app or run: lms get {resolved}"
        )
    raise RuntimeError(
        f'Model "{resolved}" is not on disk (lms ls). '
        f"LM Studio has no pull equivalent — download in the app or: lms get {resolved}"
    )


def ensure_ollama_for_llm_e2e() -> str:
    if _resolve_backend() == "lmstudio":
        return ensure_lmstudio_for_llm_e2e()
    host = _ollama_host()
    try:
        fetch_ollama_tag_names(host)
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise RuntimeError(
            f"Ollama not reachable at {host} ({err}). Install Ollama and run: ollama serve"
        ) from err
    return ensure_ollama_model_pulled()


def ensure_lmstudio_for_llm_e2e() -> str:
    host = _lmstudio_host()
    keys = fetch_lmstudio_model_keys()
    if not keys:
        try:
            base = os.environ.get("OPENAI_API_BASE", f"{host}/v1").rstrip("/")
            url = f"{base}/models" if base.endswith("/v1") else f"{base}/v1/models"
            req = urllib.request.Request(
                url, headers={"Authorization": "Bearer lm-studio"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status}")
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            raise RuntimeError(
                f"LM Studio not reachable at {host} ({err}). "
                "Start LM Studio, enable Local Server (Developer → Local Server), "
                "and ensure `lms` is on PATH."
            ) from err
        raise RuntimeError(
            "LM Studio CLI (`lms ls --json`) returned no models. "
            "Install models in LM Studio or add `lms` to PATH."
        )
    return ensure_lmstudio_model_available()


def local_llm_reachable() -> bool:
    try:
        from bright_vision_core.test_suite.local_llm import local_llm_reachable as _reachable

        return _reachable()
    except ImportError:
        return ollama_reachable()


def ollama_reachable() -> bool:
    return local_llm_reachable()


def warmup_ollama_for_tests(*, recover: bool = False) -> None:
    """Run ``scripts/local-llm-warmup-for-tests.sh`` (suite mid-run VRAM reset).

    When ``recover=True`` (LM Studio after long spec-gen or 5xx), restart Local Server
  before reload.
    """
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[2]
    script = root / "scripts" / "local-llm-warmup-for-tests.sh"
    if not script.is_file():
        return
    env = os.environ.copy()
    if recover and _resolve_backend() == "lmstudio":
        env["LMS_WARMUP_RESTART_SERVER"] = "1"
    subprocess.run(
        ["sh", str(script)],
        cwd=str(root),
        check=False,
        timeout=180,
        env=env,
    )


def recover_local_llm_for_tests() -> None:
    """Mid-suite LM Studio/Ollama reset after long jobs or HTTP 4xx/5xx retry spirals."""
    warmup_ollama_for_tests(recover=True)


def reset_vision_sessions_for_tests() -> None:
    """Interrupt and drop Vision sessions (in-process app or live ``:8741`` HTTP)."""
    base = os.environ.get("BV_LLM_PYTEST_VISION_URL", "").strip()
    if base:
        url = f"{base.rstrip('/')}/sessions/_test_reset"
        req = urllib.request.Request(url, method="POST", headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"test_reset HTTP {resp.status}")
        except Exception:
            pass
        return
    try:
        from bright_vision_core.http_api import reset_all_sessions_for_tests
    except ImportError:
        return
    reset_all_sessions_for_tests()


def probe_local_llm_chat(*, timeout_s: float = 90) -> None:
    """Minimal chat completion — fail fast when LM Studio/Ollama cannot answer."""
    model = resolve_vision_model()
    tag = resolve_ollama_tag()
    if _resolve_backend() == "lmstudio":
        base = (
            os.environ.get("OPENAI_API_BASE")
            or os.environ.get("BRIGHTVISION_LLM_BACKEND_URL", DEFAULT_LMSTUDIO_HOST) + "/v1"
        ).rstrip("/")
        api_model = tag
    else:
        base = _ollama_host().rstrip("/") + "/v1"
        api_model = model
    url = f"{base}/chat/completions"
    body = json.dumps(
        {
            "model": api_model,
            "messages": [{"role": "user", "content": "ok"}],
            "max_tokens": 8,
            "stream": False,
        }
    ).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if _resolve_backend() == "lmstudio":
        headers["Authorization"] = "Bearer lm-studio"
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            if resp.status != 200:
                raise RuntimeError(f"chat probe HTTP {resp.status}")
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise RuntimeError(f"local LLM chat probe failed at {url}: {err}") from err
