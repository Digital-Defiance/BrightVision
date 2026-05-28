"""Session debug bundle for reproducing tool-call and agent-turn issues."""

from __future__ import annotations

import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bright_vision_core.session_transcript import transcript_rows_from_coder

_MAX_TEXT = 12_000
_MAX_MESSAGES = 400


def _truncate_text(value: str, limit: int = _MAX_TEXT) -> str:
    if len(value) <= limit:
        return value
    return value[:limit] + f"\n… [{len(value) - limit} chars truncated]"


def _json_safe(value: Any, *, depth: int = 0) -> Any:
    if depth > 12:
        return "<max depth>"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _truncate_text(value)
    if isinstance(value, (list, tuple)):
        return [_json_safe(v, depth=depth + 1) for v in value]
    if isinstance(value, dict):
        return {str(k): _json_safe(v, depth=depth + 1) for k, v in value.items()}
    if hasattr(value, "model_dump"):
        try:
            return _json_safe(value.model_dump(), depth=depth + 1)
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        try:
            return _json_safe(vars(value), depth=depth + 1)
        except Exception:
            pass
    return _truncate_text(str(value), limit=2000)


def _parse_tool_arguments(raw: Any) -> Any:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"_raw": _truncate_text(text, 4000)}
    return {"_raw": _truncate_text(str(raw), 2000)}


def _messages_from_coder(coder) -> list[dict[str, Any]]:
    done = getattr(coder, "done_messages", None) or []
    cur = getattr(coder, "cur_messages", None) or []
    out: list[dict[str, Any]] = []
    for i, msg in enumerate(list(done) + list(cur)):
        if not isinstance(msg, dict):
            out.append({"index": i, "role": "unknown", "raw": _json_safe(msg)})
            continue
        row: dict[str, Any] = {
            "index": i,
            "role": msg.get("role"),
            "content": _json_safe(msg.get("content")),
        }
        if msg.get("tool_call_id"):
            row["tool_call_id"] = msg.get("tool_call_id")
        if msg.get("name"):
            row["name"] = msg.get("name")
        tool_calls = msg.get("tool_calls")
        if tool_calls:
            row["tool_calls"] = _json_safe(tool_calls)
        out.append(row)
        if len(out) >= _MAX_MESSAGES:
            break
    return out


def _tool_invocations(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    invocations: list[dict[str, Any]] = []
    for msg in messages:
        role = msg.get("role")
        if role == "assistant":
            for tc in msg.get("tool_calls") or []:
                if not isinstance(tc, dict):
                    continue
                fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
                name = fn.get("name") or tc.get("name")
                args = _parse_tool_arguments(fn.get("arguments"))
                invocations.append(
                    {
                        "kind": "call",
                        "id": tc.get("id"),
                        "name": name,
                        "arguments": args,
                    }
                )
        elif role == "tool":
            invocations.append(
                {
                    "kind": "result",
                    "tool_call_id": msg.get("tool_call_id"),
                    "name": msg.get("name"),
                    "content_preview": _truncate_text(
                        str(msg.get("content") or ""), 2000
                    ),
                }
            )
    return invocations


def _duplicate_call_hints(invocations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[str, int] = {}
    hints: list[dict[str, Any]] = []
    for inv in invocations:
        if inv.get("kind") != "call":
            continue
        key = json.dumps(
            {"name": inv.get("name"), "arguments": inv.get("arguments")},
            sort_keys=True,
            default=str,
        )
        seen[key] = seen.get(key, 0) + 1
        if seen[key] == 2:
            hints.append(
                {
                    "name": inv.get("name"),
                    "arguments": inv.get("arguments"),
                    "note": "Duplicate tool call (matches cecli duplicate rejection)",
                }
            )
    return hints


def _agent_todo_snapshot(workspace: Path) -> dict[str, Any]:
    from bright_vision_core.agent_todos import find_latest_agent_todo_txt

    path = find_latest_agent_todo_txt(workspace)
    if path is None:
        return {"path": None, "content": None}
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as err:
        return {"path": str(path), "error": str(err)}
    return {"path": str(path.relative_to(workspace)), "content": _truncate_text(text)}


def _engine_versions() -> dict[str, str]:
    versions: dict[str, str] = {}
    try:
        import bright_vision_core as bvc

        versions["bright_vision_core"] = str(getattr(bvc, "__version__", "unknown"))
    except Exception:
        versions["bright_vision_core"] = "unknown"
    try:
        from cecli._version import version as cecli_version

        versions["cecli"] = str(cecli_version)
    except Exception:
        versions["cecli"] = "unknown"
    return versions


def build_session_debug_export(session_id: str, session) -> dict[str, Any]:
    """JSON-serializable debug bundle for a live Vision session."""
    coder = session.coder
    workspace = Path(getattr(coder, "root", "") or ".").resolve()
    messages = _messages_from_coder(coder)
    invocations = _tool_invocations(messages)

    router: dict[str, Any] | None = None
    last_route = getattr(session, "_last_route", None)
    if last_route is not None:
        router = {
            "tier": getattr(last_route, "tier", None),
            "reason": getattr(last_route, "reason", None),
            "model": getattr(last_route, "model", None),
        }

    io = session.io
    recent_events = []
    ring = getattr(io, "debug_event_ring", None)
    if ring is not None:
        recent_events = [_json_safe(e) for e in list(ring)]

    return {
        "format": "brightvision-session-debug-v1",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "session": {
            "workspace": str(workspace),
            "model": getattr(coder.main_model, "name", None),
            "files_in_chat": list(coder.get_inchat_relative_files()),
            "stream": bool(getattr(coder, "stream", False)),
            "agent_mode": bool(getattr(coder, "agent_mode", False)),
        },
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "versions": _engine_versions(),
        },
        "router": router,
        "transcript": transcript_rows_from_coder(coder),
        "messages": messages,
        "tool_invocations": invocations,
        "duplicate_tool_call_hints": _duplicate_call_hints(invocations),
        "agent_todo": _agent_todo_snapshot(workspace),
        "recent_io_events": recent_events,
        "notes": (
            "Share this file when reporting stuck turns, wrong tool args, or duplicate tool calls. "
            "Redact secrets before posting publicly."
        ),
    }
