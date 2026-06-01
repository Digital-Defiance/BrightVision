"""Compress Test Lab transcripts for agent/Cursor context."""

from __future__ import annotations

import re
from pathlib import Path

from bright_vision_core.test_suite.transcript import transcript_runs_dir

# Raw log lines and [stderr]-prefixed transcript lines
_HEARTBEAT = re.compile(
    r"(\[stderr\]\s+)?… still running \(\d+s this step",
)
_FAIL_MARK = re.compile(r"^\[?\s*FAIL\s*\]|\bFAILED\b|^\[error\]|^FAIL:", re.I)
_SUCCESS_MARK = re.compile(r"\[\s*SUCCESS\s*\]|ALL TEST SUITES SUCCESSFUL", re.I)

DEFAULT_MAX_CHARS = 120_000


def _is_heartbeat_line(line: str) -> bool:
    return bool(_HEARTBEAT.search(line))


def compress_transcript_text(
    text: str,
    *,
    collapse_heartbeats: bool = True,
) -> str:
    """Drop repetitive heartbeat lines; keep a single summary per run of them."""
    if not collapse_heartbeats:
        return text
    out: list[str] = []
    pending_hb = 0
    last_hb: str | None = None
    for line in text.splitlines():
        if _is_heartbeat_line(line):
            pending_hb += 1
            last_hb = line.strip()
            continue
        if pending_hb > 0:
            if pending_hb == 1 and last_hb:
                out.append(last_hb)
            elif last_hb:
                out.append(
                    f"[digest] … collapsed {pending_hb} identical heartbeat lines; "
                    f"last: {last_hb}"
                )
            pending_hb = 0
            last_hb = None
        out.append(line)
    if pending_hb > 0 and last_hb:
        if pending_hb == 1:
            out.append(last_hb)
        else:
            out.append(
                f"[digest] … collapsed {pending_hb} heartbeat lines; last: {last_hb}"
            )
    return "\n".join(out)


def _extract_failure_excerpt(lines: list[str], *, context: int = 40) -> str:
    """Pull windows around FAIL / FAILED / [error] lines."""
    hit_indexes = [i for i, ln in enumerate(lines) if _FAIL_MARK.search(ln)]
    if not hit_indexes:
        return ""
    chunks: list[str] = []
    seen: set[tuple[int, int]] = set()
    for idx in hit_indexes:
        start = max(0, idx - context)
        end = min(len(lines), idx + context + 1)
        key = (start, end)
        if key in seen:
            continue
        seen.add(key)
        chunks.append("\n".join(lines[start:end]))
    return "\n\n--- failure excerpt ---\n\n".join(chunks)


def agent_digest_from_text(
    text: str,
    *,
    source: str = "",
    max_chars: int = DEFAULT_MAX_CHARS,
    collapse_heartbeats: bool = True,
) -> str:
    """Build a bounded digest suitable for pasting into an agent chat."""
    compressed = compress_transcript_text(text, collapse_heartbeats=collapse_heartbeats)
    lines = compressed.splitlines()
    failures = _extract_failure_excerpt(lines)
    header = [
        "# BrightVision Test Lab digest",
        f"source: {source}" if source else "",
        f"lines: {len(lines)} (heartbeats collapsed={collapse_heartbeats})",
        "",
    ]
    header = "\n".join(ln for ln in header if ln is not None)
    body = compressed
    if failures:
        body = f"{compressed}\n\n# Failures (excerpt)\n\n{failures}"
    out = f"{header}\n{body}".strip()
    if len(out) <= max_chars:
        return out
    # Prefer tail (recent failures) when truncating
    tail_budget = max_chars // 2
    head_budget = max_chars - tail_budget - 80
    return (
        out[:head_budget]
        + f"\n\n… [{len(out) - max_chars} chars omitted] …\n\n"
        + out[-tail_budget:]
    )


def resolve_transcript_for_digest(path: str | Path) -> Path:
    """Only allow reading transcripts under the suite runs dir."""
    from bright_vision_core.test_suite.timing import repo_root

    p = Path(path).expanduser()
    if not p.is_absolute():
        p = (repo_root() / p).resolve()
    else:
        p = p.resolve()
    base = transcript_runs_dir().resolve()
    if p == base or base in p.parents:
        return p
    raise ValueError(f"Transcript path must be under {base}")


def agent_digest_file(
    path: str | Path,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    collapse_heartbeats: bool = True,
) -> str:
    resolved = resolve_transcript_for_digest(path)
    text = resolved.read_text(encoding="utf-8", errors="replace")
    return agent_digest_from_text(
        text,
        source=str(resolved),
        max_chars=max_chars,
        collapse_heartbeats=collapse_heartbeats,
    )
