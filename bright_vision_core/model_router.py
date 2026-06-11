"""
Local Ollama model routing: classify prompts and pick fast vs code vs think models.

Security: only uses model names supplied in config (Settings / session create) —
no runtime fetch of arbitrary models from the network.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Literal

RouteRole = Literal["fast", "code", "think"]
RouteTier = Literal["fast", "heavy", "code", "think"]


def normalize_route_role(tier_or_role: str | None) -> RouteRole | None:
    """Map API/UI tier names to a routing role (``heavy`` → ``code``)."""
    if not tier_or_role:
        return None
    key = tier_or_role.strip().lower()
    if key == "fast":
        return "fast"
    if key in ("heavy", "code"):
        return "code"
    if key == "think":
        return "think"
    return None


def role_to_legacy_tier(role: RouteRole) -> RouteTier:
    """SSE/UI tier field: fast stays fast; code+think map to distinct tiers."""
    return role


def normalize_pool_tier(raw: str | None) -> RouteRole | None:
    if not raw:
        return None
    return normalize_route_role(raw)


# Code + think tiers keep models loaded during agent loops (keep_alive=0 → empty Ollama).
def normalize_keep_alive_for_tier(tier: RouteTier | RouteRole, value: int | str) -> int | str:
    if tier in ("heavy", "code", "think") and value in (0, "0"):
        return -1
    return value


# Per-file context bump for *display* only (routing uses message_tokens).
_FILE_TOKEN_PER_FILE = 500
_FILE_TOKEN_CAP = 2_000

# Reserve completion tokens when comparing session context to fast model window.
_FAST_CONTEXT_OUTPUT_RESERVE = 2_048

# Intent signals (case-insensitive word boundaries).
_THINK_PATTERNS = re.compile(
    r"\b("
    r"architect(?:ure|ural)?|refactor|rewrite|migrate|migration|"
    r"race\s+condition|deadlock|concurrency|distributed|microservice|"
    r"security|vulnerability|root\s+cause|design\s+review|"
    r"performance|scalability|profil(?:e|ing)|"
    r"from\s+scratch|greenfield|system\s+design|"
    r"analyze|analyse|debug|why\s+does|explain\s+why|investigate|"
    r"tradeoff|trade-off|compare\s+approaches|plan\s+the"
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


def _parse_pool_extra_params(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, dict) and raw:
        return dict(raw)
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) and parsed else None
    return None


@dataclass
class ModelPoolEntry:
    model: str
    tier: RouteRole
    enabled: bool = True
    """Per-model LiteLLM ``think`` override; ``None`` → derive from tier."""
    enable_thinking: bool | None = None
    """Per-model LiteLLM kwargs when this hopper row is routed."""
    extra_params: dict[str, Any] | None = None


def find_pool_entry(
    pool: list[ModelPoolEntry],
    model_name: str,
    role: RouteRole,
) -> ModelPoolEntry | None:
    """Match hopper row for a routed model (empty code id → session code tier)."""
    target = (model_name or "").strip()
    for entry in pool:
        if not entry.enabled:
            continue
        name = entry.model.strip()
        if name and name != target:
            continue
        if name == target or (not name and role == "code"):
            return entry
    return None


def thinking_for_pool_tier(tier: RouteRole) -> bool:
    return tier == "think"


def resolve_pool_entry_thinking(entry: ModelPoolEntry) -> bool:
    if entry.enable_thinking is not None:
        return entry.enable_thinking
    return thinking_for_pool_tier(entry.tier)


def pool_thinking_for_model(model_name: str, pool: list[ModelPoolEntry]) -> bool | None:
    """Explicit hopper ``enable_thinking`` for a resolved model id."""
    target = (model_name or "").strip()
    if not target:
        return None
    for entry in pool:
        if not entry.enabled:
            continue
        name = entry.model.strip()
        if name and name == target:
            return resolve_pool_entry_thinking(entry)
    return None


@dataclass
class ResolvedModelPool:
    fast: str
    code: str
    think: str | None


def resolve_model_pool(
    pool: list[ModelPoolEntry],
    *,
    session_code: str,
    fallback_fast: str = "",
    fallback_code: str | None = None,
    fallback_think: str | None = None,
) -> ResolvedModelPool:
    """Pick first enabled fast/code/think from hopper order."""
    fast = fallback_fast.strip()
    code = (fallback_code or "").strip() or session_code
    think = (fallback_think or "").strip() or None
    for entry in pool:
        if not entry.enabled:
            continue
        name = entry.model.strip()
        if entry.tier == "fast" and name and not fast:
            fast = name
        elif entry.tier == "code":
            if name:
                code = name
            else:
                code = session_code
        elif entry.tier == "think" and name and not think:
            think = name
    return ResolvedModelPool(fast=fast, code=code, think=think)


def pool_prefers_think(pool: list[ModelPoolEntry]) -> bool:
    """True when the first enabled think entry appears before the first enabled code entry.

    This reflects the user dragging think to the top of the hopper (highest priority).
    """
    think_idx: int | None = None
    code_idx: int | None = None
    for i, entry in enumerate(pool):
        if not entry.enabled:
            continue
        if entry.tier == "think" and entry.model.strip() and think_idx is None:
            think_idx = i
        elif entry.tier == "code" and code_idx is None:
            code_idx = i
    if think_idx is None or code_idx is None:
        return False
    return think_idx < code_idx


def _parse_env_bool(key: str) -> bool | None:
    """Parse CODE_THINK / FAST_THINK from process env or local-llm config files."""
    # Check process env first
    val = os.environ.get(key, "").strip().lower()
    if val in ("1", "true", "yes", "on"):
        return True
    if val in ("0", "false", "no", "off"):
        return False
    # Fall back to reading local-llm env files (same paths Tauri reads)
    return _read_local_llm_env_bool(key)


def _read_local_llm_env_bool(key: str) -> bool | None:
    """Read a key from the local-llm env file chain (last file wins)."""
    from pathlib import Path

    paths = []
    home = Path.home()
    xdg = os.environ.get("XDG_CONFIG_HOME", "").strip()
    config_home = Path(xdg) if xdg else home / ".config"
    paths.append(config_home / "local-llm" / "env")
    bv_root = os.environ.get("BRIGHT_VISION_ROOT", "").strip()
    if bv_root:
        paths.append(Path(bv_root) / "local-llm.env")
    # Also check cwd
    paths.append(Path.cwd() / "local-llm.env")

    result: bool | None = None
    for p in paths:
        try:
            if not p.is_file():
                continue
            for line in p.read_text().splitlines():
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                if k.strip() != key:
                    continue
                v = v.strip().strip("'\"").lower()
                if v in ("1", "true", "yes", "on"):
                    result = True
                elif v in ("0", "false", "no", "off"):
                    result = False
        except OSError:
            continue
    return result


def _apply_env_think_to_pool(pool: list[ModelPoolEntry]) -> None:
    """Override pool enable_thinking from CODE_THINK / FAST_THINK env vars.

    The frontend may send stale localStorage values; the env file is authoritative.
    """
    code_think = _parse_env_bool("CODE_THINK")
    fast_think = _parse_env_bool("FAST_THINK")
    if code_think is None and fast_think is None:
        return
    for entry in pool:
        if not entry.enabled:
            continue
        if entry.tier == "code" and code_think is not None:
            entry.enable_thinking = code_think
        elif entry.tier == "fast" and fast_think is not None:
            entry.enable_thinking = fast_think


@dataclass
class RouteTurnContext:
    agent_cmd: bool = False
    implement_turn: bool = False
    inject_todo_spec: bool = False
    spec_gen_turn: bool = False
    exploration_aborted: bool = False


@dataclass
class ModelRouterConfig:
    enabled: bool = False
    fast_model: str = ""
    heavy_model: str | None = None
    code_model: str | None = None
    think_model: str | None = None
    model_pool: list[ModelPoolEntry] = field(default_factory=list)
    token_fast_max: int = 4_096
    token_heavy_min: int = 12_000
    keep_alive_fast: int | str = 300
    keep_alive_heavy: int | str = -1
    escalate_on_failure: bool = True
    prefer_think: bool = False

    def __post_init__(self) -> None:
        self.keep_alive_heavy = normalize_keep_alive_for_tier("code", self.keep_alive_heavy)
        if not self.code_model and self.heavy_model:
            self.code_model = self.heavy_model

    @property
    def resolved_code_model(self) -> str:
        return (self.code_model or self.heavy_model or self.fast_model or "").strip()

    @property
    def resolved_think_model(self) -> str | None:
        name = (self.think_model or "").strip()
        return name or None

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
                tier = normalize_pool_tier(str(item.get("tier") or ""))
                if tier is None:
                    continue
                pool.append(
                    ModelPoolEntry(
                        model=str(item.get("model") or ""),
                        tier=tier,
                        enabled=bool(item.get("enabled", True)),
                        enable_thinking=(
                            item["enable_thinking"]
                            if item.get("enable_thinking") is not None
                            else None
                        ),
                        extra_params=_parse_pool_extra_params(item.get("extra_params")),
                    )
                )
        fallback_fast = str(raw.get("fast_model") or "").strip()
        fallback_code = (
            str(raw.get("code_model") or raw.get("heavy_model") or "").strip() or None
        )
        fallback_think = str(raw.get("think_model") or "").strip() or None
        session_code = fallback_code or fallback_fast or ""
        if pool:
            resolved = resolve_model_pool(
                pool,
                session_code=session_code or fallback_fast,
                fallback_fast=fallback_fast,
                fallback_code=fallback_code,
                fallback_think=fallback_think,
            )
            fast, code, think = resolved.fast, resolved.code, resolved.think
        else:
            fast = fallback_fast
            code = fallback_code or fallback_fast
            think = fallback_think
        if not fast:
            return None
        # Override pool enable_thinking from env (CODE_THINK / FAST_THINK) —
        # the frontend may send stale localStorage values.
        _apply_env_think_to_pool(pool)
        return cls(
            enabled=True,
            fast_model=fast,
            heavy_model=code or None,
            code_model=code or None,
            think_model=think,
            model_pool=pool,
            token_fast_max=int(raw.get("token_fast_max") or 4_096),
            token_heavy_min=int(raw.get("token_heavy_min") or 12_000),
            keep_alive_fast=raw.get("keep_alive_fast", 300),
            keep_alive_heavy=normalize_keep_alive_for_tier(
                "code", raw.get("keep_alive_heavy", -1)
            ),
            escalate_on_failure=bool(raw.get("escalate_on_failure", True)),
            prefer_think=bool(
                raw.get("prefer_think")
                if raw.get("prefer_think") is not None
                else pool_prefers_think(pool)
            ),
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
        code = (
            os.environ.get("BRIGHT_VISION_CODE_MODEL", "").strip()
            or os.environ.get("BRIGHT_VISION_HEAVY_MODEL", "").strip()
            or None
        )
        think = os.environ.get("BRIGHT_VISION_THINK_MODEL", "").strip() or None
        return cls(
            enabled=True,
            fast_model=fast,
            heavy_model=code,
            code_model=code,
            think_model=think,
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
    role: RouteRole = "code"
    enable_thinking: bool | None = None


def thinking_for_role(
    role: RouteRole,
    model_name: str,
    *,
    pool: list[ModelPoolEntry] | None = None,
) -> bool | None:
    """Per-model LiteLLM ``think`` for this route (hopper entry overrides role)."""
    if pool:
        explicit = pool_thinking_for_model(model_name, pool)
        if explicit is not None:
            return explicit
    if role == "think":
        return True
    if role in ("fast", "code"):
        return False
    return None


def estimate_message_tokens(
    user_message: str,
    *,
    message_token_count: int | None = None,
) -> int:
    """Tokens from the user message only — used for routing."""
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


def _pick_think_model(
    router: ModelRouterConfig,
    *,
    reasons: list[str],
) -> tuple[RouteRole, str]:
    think = router.resolved_think_model
    if think:
        return "think", think
    reasons.append("think_unconfigured→code")
    return "code", router.resolved_code_model


def _finish_decision(
    role: RouteRole,
    model_name: str,
    *,
    router: ModelRouterConfig,
    display_tokens: int,
    reasons: list[str],
) -> RouteDecision:
    return RouteDecision(
        tier=role_to_legacy_tier(role),
        role=role,
        model_name=model_name,
        estimated_tokens=display_tokens,
        reasons=reasons,
        enable_thinking=thinking_for_role(role, model_name, pool=router.model_pool),
    )


def classify_prompt(
    user_message: str,
    *,
    message_tokens: int,
    router: ModelRouterConfig,
    code_model_name: str | None = None,
    think_model_name: str | None = None,
    context_tokens: int | None = None,
    force_tier: RouteTier | None = None,
    turn: RouteTurnContext | None = None,
    # Back-compat for tests calling estimated_tokens=
    estimated_tokens: int | None = None,
    heavy_model_name: str | None = None,
    fast_max_input: int | None = None,
) -> RouteDecision:
    if estimated_tokens is not None and context_tokens is None:
        context_tokens = estimated_tokens
    display_tokens = context_tokens if context_tokens is not None else message_tokens
    ctx = turn or RouteTurnContext()
    code = (code_model_name or heavy_model_name or router.resolved_code_model).strip()
    think = (think_model_name or router.resolved_think_model or "").strip() or None

    forced = normalize_route_role(force_tier)
    if forced:
        if forced == "think" and not think:
            forced = "code"
        model = {
            "fast": router.fast_model,
            "code": code,
            "think": think or code,
        }[forced]
        return _finish_decision(
            forced,
            model,
            router=router,
            display_tokens=display_tokens,
            reasons=[f"forced:{forced}"],
        )

    reasons: list[str] = []

    if ctx.implement_turn or ctx.agent_cmd:
        tag = "implement_turn" if ctx.implement_turn else "agent_cmd"
        reasons.append(tag)
        # Implement/agent turns require tool use — always use code model.
        # prefer_think only applies to non-tool turns (planning, questions, spec).
        return _finish_decision("code", code, router=router, display_tokens=display_tokens, reasons=reasons)

    if ctx.inject_todo_spec and not ctx.implement_turn:
        reasons.append("inject_todo_spec")
        role, model = _pick_think_model(router, reasons=reasons)
        return _finish_decision(role, model, router=router, display_tokens=display_tokens, reasons=reasons)

    if ctx.spec_gen_turn:
        reasons.append("spec_gen")
        role, model = _pick_think_model(router, reasons=reasons)
        return _finish_decision(role, model, router=router, display_tokens=display_tokens, reasons=reasons)

    if ctx.exploration_aborted:
        reasons.append("exploration_aborted")
        role, model = _pick_think_model(router, reasons=reasons)
        return _finish_decision(role, model, router=router, display_tokens=display_tokens, reasons=reasons)

    if re.search(r"/agent\b", user_message, re.IGNORECASE):
        reasons.append("slash:/agent")
        # /agent turns require tool use — always use code model.
        return _finish_decision("code", code, router=router, display_tokens=display_tokens, reasons=reasons)

    if context_tokens is not None and context_tokens > 0:
        exceeds_fast, fast_limit = context_exceeds_fast_model_limit(
            context_tokens, router.fast_model, fast_max_input=fast_max_input
        )
        if exceeds_fast and fast_limit is not None:
            reasons.append(
                f"context_tokens>={fast_limit - _FAST_CONTEXT_OUTPUT_RESERVE} "
                f"(fast_max={fast_limit})"
            )
            if router.prefer_think and think:
                reasons.append("prefer_think")
                return _finish_decision("think", think, router=router, display_tokens=display_tokens, reasons=reasons)
            return _finish_decision("code", code, router=router, display_tokens=display_tokens, reasons=reasons)

    if message_tokens >= router.token_heavy_min:
        reasons.append(f"msg_tokens>={router.token_heavy_min}")
        if _CODE_TASK_STRONG.search(user_message) and not router.prefer_think:
            return _finish_decision("code", code, router=router, display_tokens=display_tokens, reasons=reasons)
        role, model = _pick_think_model(router, reasons=reasons)
        return _finish_decision(role, model, router=router, display_tokens=display_tokens, reasons=reasons)

    think_hit = _THINK_PATTERNS.search(user_message)
    fast_hit = _FAST_PATTERNS.search(user_message)
    code_task = _CODE_TASK_STRONG.search(user_message) is not None

    if think_hit:
        reasons.append(f"keyword:{think_hit.group(0).lower()}")
        role, model = _pick_think_model(router, reasons=reasons)
        return _finish_decision(role, model, router=router, display_tokens=display_tokens, reasons=reasons)

    if fast_hit and not router.prefer_think:
        reasons.append(f"keyword:{fast_hit.group(0).lower()}")
        return _finish_decision(
            "fast", router.fast_model, router=router, display_tokens=display_tokens, reasons=reasons
        )

    if code_task:
        reasons.append("code_task")
        if router.prefer_think and think:
            reasons.append("prefer_think")
            return _finish_decision("think", think, router=router, display_tokens=display_tokens, reasons=reasons)
        return _finish_decision("code", code, router=router, display_tokens=display_tokens, reasons=reasons)

    if message_tokens < router.token_fast_max:
        reasons.append(f"msg_tokens<{router.token_fast_max}")
        if router.prefer_think and think:
            reasons.append("prefer_think")
            return _finish_decision("think", think, router=router, display_tokens=display_tokens, reasons=reasons)
        return _finish_decision(
            "fast", router.fast_model, router=router, display_tokens=display_tokens, reasons=reasons
        )

    reasons.append("default_code")
    if router.prefer_think and think:
        reasons.append("prefer_think")
        return _finish_decision("think", think, router=router, display_tokens=display_tokens, reasons=reasons)
    return _finish_decision("code", code, router=router, display_tokens=display_tokens, reasons=reasons)


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
    role = decision.role if decision.role else normalize_route_role(decision.tier) or "code"
    if not router.escalate_on_failure or role != "fast":
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


def should_escalate_code_turn(
    decision: RouteDecision,
    *,
    router: ModelRouterConfig,
    user_message: str,
    edited_files: list[str],
    assistant_text: str,
    had_tool_error: bool = False,
) -> bool:
    """Offer think tier when code model stalled on a reasoning-heavy prompt."""
    role = decision.role if decision.role else normalize_route_role(decision.tier) or "code"
    if not router.escalate_on_failure or role != "code":
        return False
    if not router.resolved_think_model:
        return False
    if edited_files:
        return False
    if had_tool_error and _THINK_PATTERNS.search(user_message):
        return True
    if _THINK_PATTERNS.search(user_message) and len(assistant_text.strip()) < 400:
        return True
    return False


def escalation_target(decision: RouteDecision | None) -> RouteRole:
    """Next tier when auto-escalating after a failed attempt."""
    if decision is None:
        return "code"
    role = decision.role if decision.role else normalize_route_role(decision.tier) or "code"
    if role == "fast":
        return "code"
    if role == "code":
        return "think"
    return "code"
