"""Debug export bundle for background todo spec generation jobs."""

from __future__ import annotations

import platform
import sys
from datetime import datetime, timezone
from typing import Any

from bright_vision_core.session_debug import (
    _duplicate_call_hints,
    _engine_versions,
    _json_safe,
    _messages_from_coder,
    _tool_invocations,
    _truncate_text,
)
from bright_vision_core.todo_spec_jobs import SpecGenerationJob, job_wall_timeout_s, spec_gen_timeout_s

_MAX_RAW_PREVIEW = 12_000


def build_spec_job_debug_export(job: SpecGenerationJob) -> dict[str, Any]:
    """JSON-serializable debug bundle for a spec generation job (live or finished)."""
    messages = list(job.messages or [])
    invocations = _tool_invocations(messages)

    return {
        "format": "brightvision-spec-job-debug-v1",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "job_id": job.job_id,
        "job": {
            "status": job.status,
            "workspace": job.workspace,
            "todo_id": job.todo_id,
            "model": job.model,
            "mode": job.mode,
            "section": job.section,
            "prompt_preview": _truncate_text(job.prompt, 500),
            "error": job.error,
            "ears_blocked": bool(job.ears_blocked),
            "ears_issues": list(getattr(job, "ears_issues", None) or []),
            "created_at": job.created_at,
            "updated_at": job.updated_at,
            "wall_timeout_s": job_wall_timeout_s(job),
            "turn_timeout_s": getattr(job, "turn_timeout_s", None),
        },
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "versions": _engine_versions(),
        },
        "result_preview": {
            "requirements_chars": len(job.requirements or ""),
            "design_chars": len(job.design or ""),
            "tasks_md_chars": len(job.tasks_md or ""),
            "raw_preview": _truncate_text(job.raw or "", 4000),
        },
        "messages": messages,
        "tool_invocations": invocations,
        "duplicate_tool_call_hints": _duplicate_call_hints(invocations),
        "recent_io_events": [_json_safe(e) for e in list(job.recent_io_events or [])],
        "notes": (
            "Spec jobs run in a short-lived headless session separate from chat. "
            "Export while running or after error/timeout to diagnose stalled generation. "
            "Redact secrets before posting publicly."
        ),
    }


def snapshot_session_into_job(job: SpecGenerationJob, session) -> None:
    """Copy ephemeral session state onto the job record (safe while job thread runs)."""
    io = session.io
    ring = getattr(io, "debug_event_ring", None)
    if ring is not None:
        job.recent_io_events = [_json_safe(e) for e in list(ring)]
    coder = session.coder
    job.messages = _messages_from_coder(coder)
    job.model = job.model or getattr(coder.main_model, "name", None)
    if not job.raw and job.messages:
        for msg in reversed(job.messages):
            if msg.get("role") == "assistant" and msg.get("content"):
                job.raw = _truncate_text(str(msg.get("content") or ""), _MAX_RAW_PREVIEW)
                break
