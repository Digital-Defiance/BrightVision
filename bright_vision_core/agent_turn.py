"""Detect incomplete /agent turns (prose shell blocks without tool use)."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

AGENT_TURN_FEATURES = {
    "prose_shell_recovery": True,
    "agent_auto_confirm": True,
    "skip_add_file_confirm_in_chat": True,
    "agent_continue_after_shell": True,
    "agent_continue_after_token_limit": True,
    "agent_continue_after_stall": True,
}

_PROSE_SHELL_FENCE = re.compile(
    r"```(?:bash|sh|shell|zsh|fish)\s*\n.+?```",
    re.IGNORECASE | re.DOTALL,
)

_TOKEN_LIMIT_STATS = re.compile(
    r"Input tokens: ~([\d,]+).*Output tokens: ~([\d,]+)",
    re.DOTALL,
)

_TOKEN_STATS = re.compile(r"^\d+k\s+[↑↓]", re.UNICODE)

_SAFE_SHELL_PREFIX = re.compile(
    r"^(find|ls|tree|pwd|cat|head|tail|wc|file|rg|grep|git\s+(status|log|branch|diff|show)|"
    r"cargo\s+(metadata|tree|locate-project))\b",
    re.IGNORECASE,
)

_SAFE_PIPE = re.compile(
    r"^(head|tail|wc|sort|grep|rg|sed\s+-n|awk\s+'\{print)",
    re.IGNORECASE,
)

# Block command chaining and destructive/network binaries — not ``|`` (validated per segment).
_UNSAFE_SHELL = re.compile(
    r"[;&`$]|(?<![-\w/])>(?!\s)|\brm\b|\bmv\b|\bsudo\b|"
    r"(?:^|\s)curl\s+(?:https?://|ftp://)|\bwget\b|\bchmod\b|\bchown\b",
    re.IGNORECASE,
)


def is_tool_activity_event(event: dict) -> bool:
    """True for real tool work (not empty lines or token stat footers)."""
    kind = event.get("type")
    if kind == "tool_call":
        return True
    if kind != "tool_output":
        return False
    text = str(event.get("text") or "").strip()
    if not text:
        return False
    if _TOKEN_STATS.match(text):
        return False
    return True


def is_agent_tool_output_text(text: str) -> bool:
    """True for cecli agent tool headers mirrored as ``tool_output`` in headless EventIO."""
    line = (text or "").strip()
    return line.startswith("Tool Call:") and "Local" in line


def is_agent_tool_activity_event(event: dict) -> bool:
    """True when an agent tool (Local • Grep, ls, …) ran, not legacy shell helpers."""
    if event.get("type") == "tool_call":
        return True
    if event.get("type") != "tool_output":
        return False
    return is_agent_tool_output_text(str(event.get("text") or ""))


def empty_local_llm_response_in_events(events: list[dict] | tuple) -> bool:
    for event in events:
        if event.get("type") != "tool_warning":
            continue
        if "Empty response from the local model" in str(event.get("text") or ""):
            return True
    return False


def extract_prose_shell_commands(assistant_text: str) -> list[str]:
    """Pull shell lines from markdown fences in assistant prose."""
    commands: list[str] = []
    for match in _PROSE_SHELL_FENCE.finditer(assistant_text or ""):
        block = match.group(0)
        inner = re.sub(r"^```[^\n]*\n", "", block, count=1)
        inner = re.sub(r"\n```\s*$", "", inner)
        for line in inner.splitlines():
            cmd = line.strip()
            if cmd and not cmd.startswith("#"):
                commands.append(cmd)
    return commands


def is_safe_readonly_shell(command: str) -> bool:
    """Allowlist read-only exploration commands for prose-shell recovery."""
    cmd = (command or "").strip()
    if not cmd or _UNSAFE_SHELL.search(cmd):
        return False
    segments = [segment.strip() for segment in cmd.split("|")]
    if not segments or not _SAFE_SHELL_PREFIX.match(segments[0]):
        return False
    for segment in segments[1:]:
        if not _SAFE_PIPE.match(segment):
            return False
    return True


def run_prose_shell_recovery(
    workspace: Path,
    command: str,
    *,
    timeout_s: float = 45.0,
) -> str | None:
    """Run one safe read-only shell command; None when blocked or failed."""
    if not is_safe_readonly_shell(command):
        return None
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=str(workspace),
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    parts = [proc.stdout or "", proc.stderr or ""]
    out = "".join(parts).strip()
    if proc.returncode not in (0, None) and not out:
        out = f"(exit {proc.returncode})"
    return out or "(no output)"


def prose_shell_in_text(assistant_text: str) -> bool:
    return bool(_PROSE_SHELL_FENCE.search(assistant_text or ""))


def shell_output_in_events(events: list[dict] | tuple) -> bool:
    for event in events:
        if event.get("type") != "tool_output":
            continue
        text = str(event.get("text") or "")
        if "Recovered prose shell" in text:
            return True
        if text.startswith("Running "):
            return True
        if "Added " in text and "output to the chat" in text:
            return True
    return False


def empty_agent_turn_warning(*, had_tool_activity: bool, assistant_text: str) -> str | None:
    """Return warning when /agent preproc exits with no model output or tools."""
    if had_tool_activity or (assistant_text or "").strip():
        return None
    return (
        "/agent finished immediately with no model output or tool use. "
        "When a task checklist is injected above the slash line, the agent must still run — "
        "retry after `pip install -e .` and Vision API Stop/Start. "
        "If it persists, export session debug from Settings."
    )


def incomplete_agent_warning(assistant_text: str, *, had_tool_activity: bool) -> str | None:
    """Return user-facing warning when /agent ended with prose shell but no tools."""
    if had_tool_activity:
        return None
    if not _PROSE_SHELL_FENCE.search(assistant_text or ""):
        return None
    return (
        "Agent stopped without running tools — the model wrote a shell command in markdown "
        "instead of using agent tools. BrightVision auto-runs safe read-only commands "
        "(find, ls, git status, …) when possible. Retry with a nudge if output is missing. "
        "Local models often skip tool calls."
    )


def is_agent_shell_only_stop(
    *,
    had_tool_activity: bool,
    had_tool_call: bool,
) -> bool:
    """True when cecli ran legacy shell helpers but no agent tool calls."""
    return had_tool_activity and not had_tool_call


def should_auto_continue_after_shell(
    *,
    had_tool_activity: bool,
    had_tool_call: bool,
    events: list[dict] | tuple,
) -> bool:
    """One-shot auto-continue only for legacy shell output — not agent tools or empty Ollama."""
    if not is_agent_shell_only_stop(
        had_tool_activity=had_tool_activity,
        had_tool_call=had_tool_call,
    ):
        return False
    if empty_local_llm_response_in_events(events):
        return False
    return True


def empty_ollama_auto_continue_blocked_warning() -> str:
    return (
        "Skipped auto-continue: the local model returned an empty response (context limit or "
        "Ollama stall). Stop, send **continue** with a narrower prompt, or retry one checklist item."
    )


def agent_continue_after_shell_message() -> str:
    return (
        "/agent Continue the active task. Shell command output is already in the conversation. "
        "Analyze it and update the checklist using agent tools. "
        "Do not reset completed checklist items or repeat exploration you already did."
    )


def agent_stopped_after_shell_warning() -> str:
    return (
        "/agent ran a shell command and added output, then stopped before analyzing results. "
        "BrightVision will auto-continue once; if it still stops, send **continue** or retry /agent."
    )


def token_limit_exhausted_in_events(events: list[dict] | tuple) -> bool:
    """True when cecli emitted a token-limit tool_error during the turn."""
    for event in events:
        if event.get("type") != "tool_error":
            continue
        if "has hit a token limit" in str(event.get("text") or ""):
            return True
    return False


def token_limit_exhausted_in_text(assistant_text: str) -> bool:
    return "FinishReasonLength exception" in (assistant_text or "")


def token_limit_exhausted(
    *,
    events: list[dict] | tuple,
    assistant_text: str,
) -> bool:
    return token_limit_exhausted_in_events(events) or token_limit_exhausted_in_text(
        assistant_text
    )


def should_auto_continue_after_token_limit(
    *,
    events: list[dict] | tuple,
    assistant_text: str,
) -> bool:
    """One-shot auto-continue when /agent stopped on model output/context length."""
    if not AGENT_TURN_FEATURES.get("agent_continue_after_token_limit"):
        return False
    if not token_limit_exhausted(events=events, assistant_text=assistant_text):
        return False
    if empty_local_llm_response_in_events(events):
        return False
    if spurious_ollama_token_limit_in_events(events):
        return False
    return True


def spurious_ollama_token_limit_in_events(events: list[dict] | tuple) -> bool:
    """Ollama often returns finish_reason=length with ~0 output at modest input — not real exhaustion."""
    for event in events:
        if event.get("type") != "tool_error":
            continue
        text = str(event.get("text") or "")
        if "has hit a token limit" not in text:
            continue
        match = _TOKEN_LIMIT_STATS.search(text)
        if not match:
            continue
        input_tokens = int(match.group(1).replace(",", ""))
        output_tokens = int(match.group(2).replace(",", ""))
        if output_tokens <= 10 and input_tokens < 50_000:
            return True
    return False


def spurious_ollama_token_limit_warning() -> str:
    return (
        "The local model returned an empty or truncated response (Ollama finish_reason=length "
        "with ~0 output tokens — not a full context window). "
        "Use **Implement** on a single numbered step, **Clear chat**, then retry. "
        "Avoid batching many files in one EditText call."
    )


def agent_had_write_tool_in_events(events: list[dict] | tuple) -> bool:
    """True when EditText or ContextManager ran this turn."""
    markers = (
        "Tool Call: Local • EditText",
        "Tool Call: Local • ContextManager",
        "Successfully executed EditText",
        "Created and made editable",
    )
    for event in events:
        if event.get("type") != "tool_output":
            continue
        text = str(event.get("text") or "")
        if any(marker in text for marker in markers):
            return True
    return False


def repetition_detected_in_coder(coder: object | None) -> bool:
    """Cecli injects repetition as a synthetic user message in the agent loop."""
    if coder is None:
        return False
    try:
        from cecli.helpers.conversation import ConversationService, MessageTag

        messages = ConversationService.get_manager(coder).get_messages_dict(MessageTag.CUR)
        for msg in messages[-5:]:
            if msg.get("role") != "user":
                continue
            if "Repetition Detected" in str(msg.get("content") or ""):
                return True
    except Exception:
        return False
    return False


def agent_turn_stalled(
    *,
    had_tool_call: bool,
    events: list[dict] | tuple,
    coder: object | None = None,
) -> bool:
    """True when /agent ran tools but ended without productive edits."""
    if not had_tool_call:
        return False
    empty_ollama = empty_local_llm_response_in_events(events)
    repetition = repetition_detected_in_coder(coder)
    wrote_files = agent_had_write_tool_in_events(events)
    if empty_ollama:
        return True
    if repetition and not wrote_files:
        return True
    return False


def should_auto_continue_after_agent_stall(
    *,
    had_tool_call: bool,
    events: list[dict] | tuple,
    assistant_text: str,
    coder: object | None = None,
) -> bool:
    """Auto-continue when /agent explored but stalled (empty Ollama, repetition, no edits)."""
    del assistant_text  # reserved for future prose-only stall heuristics
    if not AGENT_TURN_FEATURES.get("agent_continue_after_stall"):
        return False
    return agent_turn_stalled(had_tool_call=had_tool_call, events=events, coder=coder)


def agent_continue_after_stall_message() -> str:
    return (
        "/agent Continue the active task. Tool output from exploration is already in context. "
        "Do **not** run ls, GitStatus, GitLog, or ReadRange again. "
        "Use **EditText** on **one file** for the current numbered implementation task "
        "(e.g. fill `lib/core/...` stubs ContextManager created, or edit `pubspec.yaml`). "
        "One file per EditText call."
    )


def agent_stall_recovery_warning(*, auto_continue_attempted: bool) -> str:
    if auto_continue_attempted:
        return (
            "/agent stalled again after auto-continue (empty local model or repetition guard). "
            "Use **Implement** on a single numbered step, **Clear chat**, then retry. "
            "Check Ollama with `ollama ps`."
        )
    return (
        "/agent stopped after exploration without editing files (local model stall or repetition). "
        "BrightVision will auto-continue once; if it still stops, use **Implement** on one step."
    )


def agent_continue_after_token_limit_message() -> str:
    return (
        "/agent Continue the active task from where you stopped. "
        "The previous turn hit a model token limit during tool use. "
        "Implement **only the current numbered task** (e.g. 1.1). "
        "Use **one EditText call per file** — do not batch many files. "
        "Do not repeat exploration (grep/ls/git status/ReadRange) unless strictly necessary. "
        "Do not reset completed checklist items."
    )


def agent_token_limit_recovery_warning(*, auto_continue_attempted: bool) -> str:
    if auto_continue_attempted:
        return (
            "/agent still hit a token limit after auto-continue. "
            "Send **continue** with a narrower step, use **Clear chat** to free context, "
            "or **Stop → Start** on a fresh session."
        )
    return (
        "/agent hit a model token limit before finishing. "
        "BrightVision will auto-continue once; if it still stops, send **continue** "
        "with a narrower task or clear chat to free context."
    )


def vibe_token_limit_recovery_warning() -> str:
    return (
        "This turn hit a model token limit before finishing. "
        "Send **continue** with a narrower next step, or use **Clear chat** to free context."
    )
