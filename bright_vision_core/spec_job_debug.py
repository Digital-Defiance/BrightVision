"""Vision session snapshot glue + cecli debug export."""
from cecli.spec.job_debug import build_spec_job_debug_export  # noqa: F401
from cecli.spec.jobs import SpecGenerationJob, job_wall_timeout_s, spec_gen_timeout_s

from bright_vision_core.session_debug import (
    _duplicate_call_hints,
    _engine_versions,
    _json_safe,
    _messages_from_coder,
    _tool_invocations,
    _truncate_text,
)

_MAX_RAW_PREVIEW = 12_000


def snapshot_session_into_job(job: SpecGenerationJob, session) -> None:
    """Copy ephemeral session state onto the job record (safe while job thread runs)."""
    io = session.io
    ring = getattr(io, "debug_event_ring", None)
    if isinstance(ring, (list, tuple)):
        job.recent_io_events = [_json_safe(e) for e in ring]
    coder = session.coder
    job.messages = _messages_from_coder(coder)
    job.model = job.model or getattr(coder.main_model, "name", None)
    if not job.raw and job.messages:
        for msg in reversed(job.messages):
            if msg.get("role") == "assistant" and msg.get("content"):
                job.raw = _truncate_text(str(msg.get("content") or ""), _MAX_RAW_PREVIEW)
                break
