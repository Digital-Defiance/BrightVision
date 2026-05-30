"""
Local Ollama model tiering: classify prompts and pick fast vs heavy models.

Security: only uses model names supplied in config (Settings / session create) —
no runtime fetch of arbitrary models from the network.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Literal

RouteTier = Literal["fast", "heavy"]

# Per-file context bump for *display* only (routing uses message_tokens).
_FILE_TOKEN_PER_FILE = 500
_FILE_TOKEN_CAP = 2_000

# Reserve completion tokens when comparing session context to fast model window.
_FAST_CONTEXT_OUTPUT_RESERVE = 2_048

# Intent signals (case-insensitive word boundaries).
_HEAVY_PATTERNS = re.compile(
    r"\b("
    r"architect(?:ure|ural)?|refactor|rewrite|migrate|migration|"
    r"race\s+condition|deadlock|concurrency|distributed|microservice|"
    r"security|vulnerability|root\s+cause|design\s+review|"
    r"performance|scalability|profil(?:e|ing)|"
    r"from\s+scratch|greenfield|system\s+design"
    r")\b",
    re.IGNORECASE,
)

_FAST_PATTERNS = re.compile(
    r"\b("
    r"rename|typo|whitespace|format(?:ting)?|lint|prettier|"
    r"color|colour|style|css|spacing|margin|padding|"
    r"label|tooltip|copy|wording|comment(?:s)?|"
    r"tweak|ui\s+text|button\s+text|"
    r"references?|chips?|filesystem|autocomplete|mention|"
    r"chat\s+panel|message\s+input|text\s+field|component|"
    r"like\s+we\s+have|@\s*\w"
    r")\b",
    re.IGNORECASE,
)

# "add" alone is ambiguous (UI copy vs new feature); routing uses stronger verbs only.
_CODE_TASK_STRONG = re.compile(
    r"\b(implement|fix|create|update|change|patch|write|build)\b",
    re.IGNORECASE,
)


@dataclass
class ModelPoolEntry:
    model: str
    tier: RouteTier
    enabled: bool = True


def resolve_model_pool(
    pool: list[ModelPoolEntry],
    *,
    session_heavy: str,
    fallback_fast: str = "",
    fallback_heavy: str | None = None,
) -> tuple[str, str]:
    """Pick first enabled fast/heavy from hopper order; empty heavy model id → session_heavy."""
    fast = fallback_fast.strip()
    heavy = (fallback_heavy or "").strip() or session_heavy
    for entry in pool:
        if not entry.enabled:
            continue
        name = entry.model.strip()
        if entry.tier == "fast" and name and not fast:
            fast = name
        elif entry.tier == "heavy":
            if name:
                heavy = name
            else:
                heavy = session_heavy
    return fast, heavy


@dataclass
class ModelRouterConfig:
    enabled: bool = False
    fast_model: str = ""
    heavy_model: str | None = None
    model_pool: list[ModelPoolEntry] = field(default_factory=list)
    token_fast_max: int = 4_096
    token_heavy_min: int = 12_000
    keep_alive_fast: int | str = 300
    keep_alive_heavy: int | str = 0
    escalate_on_failure: bool = True

    @classmethod
    def from_payload(cls, raw: dict[str, Any] | None) -> ModelRouterConfig | None:
        if not raw:
            return None
        enabled = bool(raw.get("enabled"))
        if not enabled:
            return cls(enabled=False)
        pool_raw = raw.get("model_pool") or []
        pool: list[ModelPoolEntry] = []
        if isinstance(pool_raw, list):
            for item in pool_raw:
                if not isinstance(item, dict):
                    continue
                tier = item.get("tier")
                if tier not in ("fast", "heavy"):
                    continue
                pool.append(
                    ModelPoolEntry(
                        model=str(item.get("model") or ""),
                        tier=tier,
                        enabled=bool(item.get("enabled", True)),
                    )
                )
        fallback_fast = str(raw.get("fast_model") or "").strip()
        fallback_heavy = str(raw.get("heavy_model") or "").strip() or None
        session_heavy = fallback_heavy or fallback_fast or ""
        if pool:
            fast, heavy = resolve_model_pool(
                pool,
                session_heavy=session_heavy or fallback_fast,
                fallback_fast=fallback_fast,
                fallback_heavy=fallback_heavy,
            )
        else:
            fast, heavy = fallback_fast, fallback_heavy or fallback_fast
        if not fast:
            return None
        return cls(
            enabled=True,
            fast_model=fast,
            heavy_model=heavy or None,
            model_pool=pool,
            token_fast_max=int(raw.get("token_fast_max") or 4_096),
            token_heavy_min=int(raw.get("token_heavy_min") or 12_000),
            keep_alive_fast=raw.get("keep_alive_fast", 300),
            keep_alive_heavy=raw.get("keep_alive_heavy", 0),
            escalate_on_failure=bool(raw.get("escalate_on_failure", True)),
        )

    @classmethod
    def from_env(cls) -> ModelRouterConfig | None:
        if os.environ.get("BRIGHT_VISION_MODEL_ROUTER", "").strip() not in (
            "1",
            "true",
            "yes",
            "on",
        ):
            return None
        fast = os.environ.get("BRIGHT_VISION_FAST_MODEL", "").strip()
        if not fast:
            return None
        heavy = os.environ.get("BRIGHT_VISION_HEAVY_MODEL", "").strip() or None
        return cls(
            enabled=True,
            fast_model=fast,
            heavy_model=heavy,
            token_fast_max=int(os.environ.get("BRIGHT_VISION_ROUTER_TOKEN_FAST_MAX", "4096")),
            token_heavy_min=int(os.environ.get("BRIGHT_VISION_ROUTER_TOKEN_HEAVY_MIN", "12000")),
            escalate_on_failure=os.environ.get("BRIGHT_VISION_ROUTER_ESCALATE", "1").strip()
            not in ("0", "false", "no"),
        )


@dataclass
class RouteDecision:
    tier: RouteTier
    model_name: str
    estimated_tokens: int
    reasons: list[str] = field(default_factory=list)


def estimate_message_tokens(
    user_message: str,
    *,
    message_token_count: int | None = None,
) -> int:
    """Tokens from the user message only — used for fast/heavy routing."""
    if message_token_count is not None and message_token_count > 0:
        return message_token_count
    return max(len(user_message) // 4, 32)


def estimate_prompt_tokens(
    user_message: str,
    *,
    files_in_chat: int = 0,
    message_token_count: int | None = None,
) -> int:
    """Rough context size for UI (message + capped file bump). Not used for tier choice."""
    base = estimate_message_tokens(user_message, message_token_count=message_token_count)
    file_part = min(max(files_in_chat, 0) * _FILE_TOKEN_PER_FILE, _FILE_TOKEN_CAP)
    return base + file_part


@lru_cache(maxsize=64)
def lookup_model_max_input_tokens(model_name: str) -> int | None:
    """Cecli/LiteLLM metadata for a model id (e.g. ``ollama_chat/deepseek-coder:6.7b``)."""
    name = (model_name or "").strip()
    if not name:
        return None
    try:
        from cecli.models import model_info_manager

        info = model_info_manager.get_model_info(name) or {}
        raw = info.get("max_input_tokens") or 0
        return int(raw) if int(raw) > 0 else None
    except Exception:
        return None


def context_exceeds_fast_model_limit(
    context_tokens: int,
    fast_model_name: str,
    *,
    fast_max_input: int | None = None,
    output_reserve: int = _FAST_CONTEXT_OUTPUT_RESERVE,
) -> tuple[bool, int | None]:
    """
    True when the live session context cannot fit the fast model (plus completion reserve).

    ``fast_max_input`` overrides metadata lookup (tests).
    """
    if context_tokens <= 0:
        return False, None
    limit = fast_max_input
    if limit is None:
        limit = lookup_model_max_input_tokens(fast_model_name)
    if limit is None:
        return False, None
    return context_tokens + output_reserve > limit, limit


def classify_prompt(
    user_message: str,
    *,
    message_tokens: int,
    router: ModelRouterConfig,
    heavy_model_name: str,
    context_tokens: int | None = None,
    force_tier: RouteTier | None = None,
    # Back-compat for tests calling estimated_tokens=
    estimated_tokens: int | None = None,
) -> RouteDecision:
    if estimated_tokens is not None and context_tokens is None:
        context_tokens = estimated_tokens
    display_tokens = context_tokens if context_tokens is not None else message_tokens

    if force_tier:
        model = router.fast_model if force_tier == "fast" else heavy_model_name
        return RouteDecision(
            tier=force_tier,
            model_name=model,
            estimated_tokens=display_tokens,
            reasons=[f"forced:{force_tier}"],
        )

    reasons: list[str] = []

    if context_tokens is not None and context_tokens > 0:
        exceeds_fast, fast_limit = context_exceeds_fast_model_limit(
            context_tokens, router.fast_model
        )
        if exceeds_fast and fast_limit is not None:
            reasons.append(
                f"context_tokens>={fast_limit - _FAST_CONTEXT_OUTPUT_RESERVE} "
                f"(fast_max={fast_limit})"
            )
            return RouteDecision(
                tier="heavy",
                model_name=heavy_model_name,
                estimated_tokens=display_tokens,
                reasons=reasons,
            )

    if message_tokens >= router.token_heavy_min:
        reasons.append(f"msg_tokens>={router.token_heavy_min}")
        return RouteDecision(
            tier="heavy",
            model_name=heavy_model_name,
            estimated_tokens=display_tokens,
            reasons=reasons,
        )

    heavy_hit = _HEAVY_PATTERNS.search(user_message)
    fast_hit = _FAST_PATTERNS.search(user_message)
    code_task = _CODE_TASK_STRONG.search(user_message) is not None

    if heavy_hit:
        reasons.append(f"keyword:{heavy_hit.group(0).lower()}")
        return RouteDecision(
            tier="heavy",
            model_name=heavy_model_name,
            estimated_tokens=display_tokens,
            reasons=reasons,
        )

    if fast_hit:
        reasons.append(f"keyword:{fast_hit.group(0).lower()}")
        return RouteDecision(
            tier="fast",
            model_name=router.fast_model,
            estimated_tokens=display_tokens,
            reasons=reasons,
        )

    if message_tokens < router.token_fast_max and not code_task:
        reasons.append(f"msg_tokens<{router.token_fast_max}")
        return RouteDecision(
            tier="fast",
            model_name=router.fast_model,
            estimated_tokens=display_tokens,
            reasons=reasons,
        )

    if message_tokens < router.token_heavy_min:
        reasons.append("default_fast")
        return RouteDecision(
            tier="fast",
            model_name=router.fast_model,
            estimated_tokens=display_tokens,
            reasons=reasons,
        )

    reasons.append("default_heavy")
    return RouteDecision(
        tier="heavy",
        model_name=heavy_model_name,
        estimated_tokens=display_tokens,
        reasons=reasons,
    )


_CONTEXT_LIMIT_RE = re.compile(
    r"exceeds the\s+[\d,]+\s+token limit",
    re.IGNORECASE,
)


def should_escalate_fast_turn(
    decision: RouteDecision,
    *,
    router: ModelRouterConfig,
    user_message: str,
    edited_files: list[str],
    assistant_text: str,
    had_tool_error: bool = False,
    tool_error_text: str = "",
) -> bool:
    if not router.escalate_on_failure or decision.tier != "fast":
        return False
    if edited_files:
        return False
    if had_tool_error and _CONTEXT_LIMIT_RE.search(tool_error_text):
        return True
    if had_tool_error:
        return _CODE_TASK_STRONG.search(user_message) is not None
    if len(assistant_text.strip()) > 400:
        return False
    if not _CODE_TASK_STRONG.search(user_message):
        return False
    return True
