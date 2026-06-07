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
    "implement_continue_after_edit_failure": True,
}

_EDIT_TOOL_ERROR_MARKERS = (
    "Error in EditText",
    "Error in ContextManager",
    "No edits were successfully applied",
)

EDIT_FAILURE_ABORT_THRESHOLD = 3
READRANGE_FAILURE_ABORT_THRESHOLD = 2
LS_EXPLORATION_ABORT_THRESHOLD = 4
AGENT_EXPLORATION_EMPTY_ABORT_ROUNDS = 4

_PROSE_SHELL_FENCE = re.compile(
    r"```(?:bash|sh|shell|zsh|fish)\s*\n.+?```",
    re.IGNORECASE | re.DOTALL,
)

_TOKEN_LIMIT_STATS = re.compile(
    r"Input tokens: ~([\d,]+).*Output tokens: ~([\d,]+)",
    re.DOTALL,
)

_TOKEN_STATS = re.compile(r"^\d+k\s+[↑↓]", re.UNICODE)

# Cecli usage footer: ``14k ↑ 54 ↓ 306k ↑↓`` (input ↑ output ↓ cumulative ↑↓).
_TOKEN_USAGE_LINE = re.compile(
    r"^([\d.]+)k\s+↑\s+([\d.]+k?)\s+↓(?:\s+([\d.]+)k\s+↑↓)?$",
    re.UNICODE,
)

# Long /agent loops that process this many tokens in one turn rarely recover in-place.
AGENT_CONTEXT_DEAD_END_CUMULATIVE = 180_000
AGENT_CONTEXT_DEAD_END_LLM_ROUNDS = 15
AGENT_CONTEXT_DEAD_END_INPUT_FUDGE = 0.7
AGENT_CONTEXT_PRESSURE_CUMULATIVE = 200_000
AGENT_CONTEXT_ABORT_CUMULATIVE = 220_000

_READRANGE_FIRST_EDIT_ERROR = "Please call `ReadRange` first"

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


def _parse_k_token_count(raw: str) -> int:
    text = (raw or "").strip()
    if not text:
        return 0
    if text.endswith("k"):
        return int(float(text[:-1]) * 1000)
    return int(float(text))


def parse_token_usage_stat(text: str) -> dict[str, int] | None:
    """Parse cecli ``Nk ↑ Mk ↓ …`` usage footer from tool_output."""
    line = (text or "").strip()
    match = _TOKEN_USAGE_LINE.match(line)
    if not match:
        return None
    payload: dict[str, int] = {
        "input": _parse_k_token_count(f"{match.group(1)}k"),
        "output": _parse_k_token_count(match.group(2)),
    }
    if match.group(3):
        payload["cumulative"] = _parse_k_token_count(f"{match.group(3)}k")
    return payload


def token_usage_stats_from_events(events: list[dict] | tuple) -> list[dict[str, int]]:
    stats: list[dict[str, int]] = []
    for event in events:
        if event.get("type") != "tool_output":
            continue
        parsed = parse_token_usage_stat(str(event.get("text") or ""))
        if parsed:
            stats.append(parsed)
    return stats


def max_cumulative_tokens_from_events(events: list[dict] | tuple) -> int:
    stats = token_usage_stats_from_events(events)
    return max((s.get("cumulative", 0) for s in stats), default=0)


def llm_round_count_from_events(events: list[dict] | tuple) -> int:
    return len(token_usage_stats_from_events(events))


def is_readrange_first_edit_error_event(event: dict) -> bool:
    if event.get("type") != "tool_error":
        return False
    return _READRANGE_FIRST_EDIT_ERROR in str(event.get("text") or "")


def is_readrange_tool_error_event(event: dict) -> bool:
    """ReadRange execute/format failures (not EditText 'call ReadRange first')."""
    if event.get("type") != "tool_error":
        return False
    text = str(event.get("text") or "")
    if is_readrange_first_edit_error_event(event):
        return False
    markers = (
        "Error in ReadRange",
        "read_range.py",
        "Errors encountered for",
        "Tool Output Error: readrange",
        "Invalid Tool JSON",
    )
    return any(marker in text for marker in markers)


def readrange_failure_abort_warning(*, total: int) -> str:
    return (
        f"Stopped this turn after {total} ReadRange failure(s). "
        "Use string markers `@000` / `000@` for empty files — not line numbers. "
        "Retry with **Implement** on one step after **Clear chat**; do not loop on ReadRange."
    )


def should_abort_turn_for_readrange_failures(
    *,
    total_readrange_failures: int,
    edit_failure_continuation: bool,
) -> bool:
    if edit_failure_continuation:
        return False
    return total_readrange_failures >= READRANGE_FAILURE_ABORT_THRESHOLD


def agent_turn_context_overloaded(
    events: list[dict] | tuple,
    *,
    cumulative_hint: int = 0,
) -> bool:
    """True when an /agent turn processed enough tokens that auto-continue likely loops."""
    cumulative = max(max_cumulative_tokens_from_events(events), cumulative_hint)
    return cumulative >= AGENT_CONTEXT_ABORT_CUMULATIVE


def agent_context_pressure_warning(*, cumulative: int, rounds: int) -> str:
    cum_label = f"{cumulative // 1000}k" if cumulative >= 1000 else str(cumulative)
    return (
        f"/agent context pressure: ~{cum_label} tokens processed across ~{rounds} model calls. "
        "Finish with **Implement** on one numbered step instead of a long /agent loop. "
        "Call **ReadRange** before every **EditText**; consider **Clear chat** if edits keep failing."
    )


def agent_context_pressure_abort_warning(*, cumulative: int, rounds: int) -> str:
    cum_label = f"{cumulative // 1000}k" if cumulative >= 1000 else str(cumulative)
    return (
        f"Stopped /agent: ~{cum_label} tokens across ~{rounds} calls and EditText failed "
        "(ReadRange required after prior edits). "
        "Check git diff, then **Clear chat** and use **Tasks → Implement** on one step — "
        "not another /agent resume."
    )


def should_abort_agent_for_context_pressure(
    *,
    cumulative_tokens: int,
    edit_error_event: dict | None,
    agent_cmd: bool,
    agent_continuation: bool,
) -> bool:
    if not agent_cmd or agent_continuation:
        return False
    if cumulative_tokens < AGENT_CONTEXT_ABORT_CUMULATIVE:
        return False
    return edit_error_event is not None and is_readrange_first_edit_error_event(
        edit_error_event
    )


def agent_context_dead_end_in_events(
    events: list[dict] | tuple,
    *,
    model_context_tokens: int | None = 262_144,
) -> bool:
    """
    True when a long /agent turn likely exhausted workable context (empty Ollama +
    many LLM rounds or high cumulative token processing).
    """
    cumulative = max(max_cumulative_tokens_from_events(events), 0)
    if cumulative >= AGENT_CONTEXT_ABORT_CUMULATIVE:
        return True
    if not empty_local_llm_response_in_events(events):
        return False
    stats = token_usage_stats_from_events(events)
    if not stats:
        return False
    rounds = len(stats)
    cumulative = max((s.get("cumulative", 0) for s in stats), default=0)
    last_input = stats[-1].get("input", 0)
    if rounds >= AGENT_CONTEXT_DEAD_END_LLM_ROUNDS:
        return True
    if cumulative >= AGENT_CONTEXT_DEAD_END_CUMULATIVE:
        return True
    if model_context_tokens and model_context_tokens > 0:
        if last_input >= int(model_context_tokens * AGENT_CONTEXT_DEAD_END_INPUT_FUDGE):
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


def is_ls_tool_output_event(event: dict) -> bool:
    if event.get("type") != "tool_output":
        return False
    return "Tool Call: Local • ls" in str(event.get("text") or "")


def ls_call_count_from_events(events: list[dict] | tuple) -> int:
    return sum(1 for event in events if is_ls_tool_output_event(event))


def exploration_ls_abort_warning(*, total: int) -> str:
    return (
        f"Stopped this turn after {total} ls call(s) with no file edits. "
        "If `lib/` is missing, use **ContextManager** to scaffold — do not ls again. "
        "**Clear chat** and **Implement** task **1.1** first, then later steps."
    )


def should_abort_turn_for_ls_exploration(
    *,
    total_ls_calls: int,
    had_write: bool,
    edit_failure_continuation: bool,
    agent_continuation: bool = False,
) -> bool:
    if edit_failure_continuation or agent_continuation:
        return False
    if had_write:
        return False
    return total_ls_calls >= LS_EXPLORATION_ABORT_THRESHOLD


def exploration_repetition_abort_warning() -> str:
    return (
        "Stopped this turn: repetition guard fired (repeated ls/ReadRange) with no edits. "
        "**Clear chat** and **Implement** one prerequisite step (e.g. **1.1** scaffold `lib/`) — "
        "not another resume."
    )


def should_abort_turn_for_repetition_guard(
    *,
    coder: object | None,
    events: list[dict] | tuple,
    edit_failure_continuation: bool,
    agent_continuation: bool = False,
) -> bool:
    if edit_failure_continuation or agent_continuation:
        return False
    if agent_had_write_tool_in_events(events):
        return False
    return repetition_detected_in_coder(coder)


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


def empty_ollama_exploration_exhausted(events: list[dict] | tuple) -> bool:
    """Empty Ollama after several tool rounds with no file edits — auto-continue usually loops."""
    if not empty_local_llm_response_in_events(events):
        return False
    if agent_had_write_tool_in_events(events):
        return False
    return llm_round_count_from_events(events) >= AGENT_EXPLORATION_EMPTY_ABORT_ROUNDS


def empty_ollama_exploration_blocked_warning() -> str:
    return (
        "Skipped auto-continue: Ollama returned empty after exploration (ls/ReadRange) "
        "with no edits. If `lib/` is missing, **Implement** task **1.1** (scaffold) first. "
        "Otherwise set **Settings → Model router → Heavy keep-alive** to **-1**, "
        "**Terminal → Local LLM → Start**, then **Implement** one step."
    )


def should_auto_continue_after_agent_stall(
    *,
    had_tool_call: bool,
    events: list[dict] | tuple,
    assistant_text: str,
    coder: object | None = None,
    model_context_tokens: int | None = None,
) -> bool:
    """Auto-continue when /agent explored but stalled (empty Ollama, repetition, no edits)."""
    del assistant_text  # reserved for future prose-only stall heuristics
    if not AGENT_TURN_FEATURES.get("agent_continue_after_stall"):
        return False
    if agent_context_dead_end_in_events(
        events,
        model_context_tokens=model_context_tokens or _model_context_tokens(coder),
    ):
        return False
    if agent_turn_context_overloaded(events):
        return False
    if not agent_turn_stalled(had_tool_call=had_tool_call, events=events, coder=coder):
        return False
    if empty_ollama_exploration_exhausted(events):
        return False
    return True


def _model_context_tokens(coder: object | None) -> int | None:
    if coder is None:
        return None
    try:
        return int(coder.main_model.info.get("max_input_tokens") or 0) or None
    except Exception:
        return None


def agent_context_dead_end_warning(
    *,
    events: list[dict] | tuple,
    auto_continue_attempted: bool,
    model_context_tokens: int | None = None,
) -> str:
    del model_context_tokens
    stats = token_usage_stats_from_events(events)
    rounds = len(stats)
    cumulative = max((s.get("cumulative", 0) for s in stats), default=0)
    if cumulative >= AGENT_CONTEXT_ABORT_CUMULATIVE and not empty_local_llm_response_in_events(
        events
    ):
        cum_label = f"{cumulative // 1000}k" if cumulative >= 1000 else str(cumulative)
        lead = (
            f"/agent context overloaded (~{cum_label} tokens across ~{rounds} model calls). "
            "Continuing in the same chat will likely loop or edit the wrong files."
        )
        recovery = (
            "Check git diff, **Clear chat** (or `/clear`), then **Tasks → Implement** on "
            "**one** numbered step. Avoid another /agent resume in this session."
        )
        if auto_continue_attempted:
            return f"{lead} Auto-continue already ran. {recovery}"
        return f"{lead} {recovery}"
    cum_label = f"{cumulative // 1000}k" if cumulative >= 1000 else str(cumulative)
    lead = (
        f"/agent hit a context dead end after ~{rounds} model calls"
        f"{f' ({cum_label} tokens processed this turn)' if cumulative else ''}. "
        "The local model returned empty responses — continuing in the same chat will loop."
    )
    recovery = (
        "Use **Tasks → Implement** on **one** numbered step (not /agent), or send a narrow "
        "message without exploration. If it persists: chat **Clear** (or `/clear`), then "
        "**Stop → Start** for a fresh session."
    )
    if auto_continue_attempted:
        return f"{lead} Auto-continue already ran once. {recovery}"
    return f"{lead} BrightVision will auto-continue once; if it still stops, {recovery}"


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


def agent_ran_flutter_via_shell(events: list[dict] | tuple) -> bool:
    for event in events:
        if event.get("type") != "tool_output":
            continue
        text = str(event.get("text") or "").lower()
        if "command not found: flutter" in text:
            return True
        if "shell command completed" in text and "flutter test" in text:
            return True
    return False


def flutter_test_shell_blocked_warning() -> str:
    return (
        "Do not run `flutter test` via Command — BrightVision runs flutter test at the "
        "end of implement turns. Wait for the ✅/❌ flutter test line before marking test tasks done."
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


def edit_tool_failures_in_events(events: list[dict] | tuple) -> list[str]:
    """EditText/ContextManager tool_error texts from the turn event ring."""
    failures: list[str] = []
    for event in events:
        if is_edit_tool_error_event(event):
            failures.append(str(event.get("text") or "").strip())
    return failures


def is_edit_tool_error_event(event: dict) -> bool:
    if event.get("type") != "tool_error":
        return False
    text = str(event.get("text") or "").strip()
    if not text:
        return False
    if any(marker in text for marker in _EDIT_TOOL_ERROR_MARKERS):
        return True
    return "EditText" in text or "ContextManager" in text


def is_edit_tool_success_event(event: dict) -> bool:
    if event.get("type") != "tool_output":
        return False
    text = str(event.get("text") or "")
    return (
        ("Applied " in text and " edits in " in text)
        or "Successfully executed EditText" in text
        or ("Created '" in text and "editable" in text)
    )


def is_read_range_success_event(event: dict) -> bool:
    if event.get("type") != "tool_output":
        return False
    text = str(event.get("text") or "")
    return "Retrieved context for" in text or text.strip().startswith("range_")


def should_abort_turn_for_edit_failures(
    *,
    consecutive_edit_failures: int,
    total_edit_failures: int,
    agent_cmd: bool,
    edit_failure_continuation: bool,
) -> bool:
    """Stop a runaway implement turn retrying EditText without ReadRange."""
    if agent_cmd or edit_failure_continuation:
        return False
    if not AGENT_TURN_FEATURES.get("implement_continue_after_edit_failure"):
        return False
    return (
        consecutive_edit_failures >= EDIT_FAILURE_ABORT_THRESHOLD
        or total_edit_failures >= EDIT_FAILURE_ABORT_THRESHOLD
    )


def edit_failure_abort_warning(*, consecutive: int, total: int) -> str:
    return (
        f"Stopped this turn after {total} EditText failure(s)"
        f"{f' ({consecutive} in a row without a successful read/edit)' if consecutive >= EDIT_FAILURE_ABORT_THRESHOLD else ''}. "
        "Run **ReadRange** on the target file (`@000`/`000@`), then **EditText** one file only. "
        "Do not mark tasks done in UpdateTodoList until edits succeed."
    )


def edit_failure_turn_warning(
    *,
    events: list[dict] | tuple,
    edited_files: list[str] | None = None,
) -> str | None:
    """User-facing warning when edit tools failed during the turn."""
    if not edit_tool_failures_in_events(events):
        return None
    if not edited_files:
        return (
            "EditText/ContextManager failed and no files were saved this turn. "
            "Run **ReadRange** on the target file (`@000`/`000@` for new or empty files), "
            "then **EditText** one file per call. "
            "Do not mark tasks done in UpdateTodoList until edits succeed."
        )
    return (
        "One or more EditText calls failed this turn (see errors above). "
        "Run **ReadRange** before editing; one file per EditText call. "
        "Do not mark implementation tasks done until the failed edit succeeds."
    )


def should_auto_continue_after_edit_failure(
    *,
    events: list[dict] | tuple,
    agent_cmd: bool,
    edit_failure_continuation: bool,
) -> bool:
    """One-shot auto-continue for implement/spec-focus turns after EditText failure."""
    if not AGENT_TURN_FEATURES.get("implement_continue_after_edit_failure"):
        return False
    if agent_cmd or edit_failure_continuation:
        return False
    return bool(edit_tool_failures_in_events(events))


def edit_failure_continue_message() -> str:
    return (
        "The last EditText failed. Call **ReadRange** on the target file first "
        "(`@000`/`000@` for new or empty files), then **EditText** exactly one file. "
        "Do not update UpdateTodoList until the edit succeeds."
    )
