"""LM Studio backend client — model lifecycle via ``lms`` CLI JSON output."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

LMSTUDIO_DEFAULT_HOST = "http://localhost:1234"
_LMS_BIN = "lms"


def _lms_path() -> str | None:
    return shutil.which(_LMS_BIN)


async def _run_lms_json(args: list[str]) -> list[dict[str, Any]] | None:
    """Run ``lms`` with *args* and parse JSON array stdout."""
    lms = _lms_path()
    if not lms:
        logger.error("LmStudioBackendClient: %s not found on PATH", _LMS_BIN)
        return None
    cmd = [lms, *args]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            err = stderr.decode("utf-8", errors="replace").strip()
            logger.error(
                "LmStudioBackendClient: %s failed (exit %s): %s",
                " ".join(cmd),
                proc.returncode,
                err or "(no stderr)",
            )
            return None
        raw = stdout.decode("utf-8", errors="replace").strip()
        if not raw:
            return []
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [row for row in parsed if isinstance(row, dict)]
        logger.error("LmStudioBackendClient: expected JSON array from %s", " ".join(cmd))
        return None
    except json.JSONDecodeError:
        logger.error("LmStudioBackendClient: invalid JSON from %s", " ".join(cmd), exc_info=True)
        return None
    except Exception:  # noqa: BLE001
        logger.error("LmStudioBackendClient: %s failed", " ".join(cmd), exc_info=True)
        return None


def _strip_provider_prefix(tag: str) -> str:
    for prefix in ("ollama_chat/", "ollama/", "openai/"):
        if tag.startswith(prefix):
            return tag[len(prefix) :]
    return tag


def _llm_rows(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not rows:
        return []
    return [row for row in rows if row.get("type") == "llm"]


@dataclass(frozen=True)
class LmStudioLoadOptions:
    """Flags forwarded to ``lms load`` (see ``lms load --help``)."""

    ttl_secs: int | None = None
    context_length: int | None = None
    parallel: int | None = None
    identifier: str | None = None

    @classmethod
    def from_env(cls) -> LmStudioLoadOptions:
        ttl_raw = os.environ.get("BRIGHTVISION_LLM_LOAD_TTL", "").strip()
        ttl_secs = int(ttl_raw) if ttl_raw.isdigit() and int(ttl_raw) > 0 else None
        ctx_raw = os.environ.get("BRIGHTVISION_LLM_LOAD_CONTEXT_LENGTH", "").strip()
        context_length = int(ctx_raw) if ctx_raw.isdigit() and int(ctx_raw) > 0 else None
        par_raw = os.environ.get("BRIGHTVISION_LLM_LOAD_PARALLEL", "").strip()
        parallel = int(par_raw) if par_raw.isdigit() and int(par_raw) > 0 else None
        return cls(ttl_secs=ttl_secs, context_length=context_length, parallel=parallel)

    def with_identifier(self, model_key: str) -> LmStudioLoadOptions:
        if self.identifier:
            return self
        return LmStudioLoadOptions(
            ttl_secs=self.ttl_secs,
            context_length=self.context_length,
            parallel=self.parallel,
            identifier=model_key,
        )

    def argv(self) -> list[str]:
        args = ["-y"]
        if self.ttl_secs is not None:
            args.extend(["--ttl", str(self.ttl_secs)])
        if self.context_length is not None:
            args.extend(["--context-length", str(self.context_length)])
        if self.parallel is not None:
            args.extend(["--parallel", str(self.parallel)])
        if self.identifier:
            args.extend(["--identifier", self.identifier])
        return args


class LmStudioBackendClient:
    """Backend client for LM Studio via the ``lms`` CLI."""

    def __init__(self, host: str = LMSTUDIO_DEFAULT_HOST) -> None:
        self._host = (host or LMSTUDIO_DEFAULT_HOST).rstrip("/")

    async def _list_llm_rows(self) -> list[dict[str, Any]]:
        rows = await _run_lms_json(["ls", "--json"])
        return _llm_rows(rows)

    async def _loaded_keys(self) -> set[str]:
        rows = await _run_lms_json(["ps", "--json"])
        if not rows:
            return set()
        keys: set[str] = set()
        for row in rows:
            if row.get("type") == "embedding":
                continue
            for field in ("identifier", "modelKey", "selectedVariant"):
                val = row.get(field)
                if isinstance(val, str) and val.strip():
                    keys.add(val.strip())
        return keys

    async def _load_model(self, key: str, opts: LmStudioLoadOptions | None = None) -> bool:
        lms = _lms_path()
        if not lms:
            return False
        load_opts = (opts or LmStudioLoadOptions.from_env()).with_identifier(key)
        cmd = [lms, "load", key, *load_opts.argv()]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()
            if proc.returncode == 0:
                return True
            err = stderr.decode("utf-8", errors="replace").strip()
            logger.error(
                "LmStudioBackendClient: %s failed: %s",
                " ".join(cmd),
                err or f"exit {proc.returncode}",
            )
            return False
        except Exception:  # noqa: BLE001
            logger.error("LmStudioBackendClient: lms load %s failed", key, exc_info=True)
            return False

    async def preload_models(self, models: list[str]) -> list[str]:
        """Load models via ``lms load -y``. Returns successfully loaded model keys."""
        loaded: list[str] = []
        base_opts = LmStudioLoadOptions.from_env()
        for model in models:
            key = _strip_provider_prefix(model.strip())
            if not key:
                continue
            if await self._load_model(key, base_opts):
                loaded.append(key)
        return loaded

    async def get_vram_usage(self) -> int | None:
        """LM Studio does not expose VRAM via CLI. Returns ``None``."""
        return None

    async def get_context_window(self, model: str) -> int | None:
        """Return ``maxContextLength`` from ``lms ls --json`` when available."""
        key = _strip_provider_prefix(model.strip())
        if not key:
            return None
        try:
            for row in await self._list_llm_rows():
                model_key = str(row.get("modelKey", "")).strip()
                if model_key == key or model_key.startswith(f"{key}@"):
                    ctx = row.get("maxContextLength")
                    if isinstance(ctx, int) and ctx > 0:
                        return ctx
            return None
        except Exception:  # noqa: BLE001
            logger.error(
                "LmStudioBackendClient: get_context_window failed for '%s'",
                model,
                exc_info=True,
            )
            return None

    async def list_available_models(self) -> list[str]:
        """Return LLM ``modelKey`` values from ``lms ls --json``."""
        try:
            keys: list[str] = []
            for row in await self._list_llm_rows():
                model_key = row.get("modelKey")
                if isinstance(model_key, str) and model_key.strip():
                    keys.append(model_key.strip())
            return keys
        except Exception:  # noqa: BLE001
            logger.error("LmStudioBackendClient: list_available_models failed", exc_info=True)
            return []
