"""Post-step verify gate and auto-advance logic for spec-driven implement turns.

Three capabilities:
1. **Verify gate** — parse `verify:` lines from tasks_md checklist items and run them
   after the agent marks a step done. If it fails, warn and block advancement.
2. **Auto-advance** — after a successful step (verified or no verify line), determine
   the next open step and auto-trigger it in the same session.
3. **Duplicate output detection** — detect when generated file content is duplicated
   (model emitted the same code twice in one file).

Feature flags (env):
    BV_IMPLEMENT_VERIFY=1          Enable post-step verify (default: 1)
    BV_IMPLEMENT_AUTO_ADVANCE=1    Enable auto-advance to next step (default: 1)
    BV_DUPLICATE_DETECT=1          Enable duplicate output detection (default: 1)
    BV_IMPLEMENT_MAX_ADVANCES=5    Max auto-advances per session (default: 5)
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------


def _env_bool(key: str, default: bool = True) -> bool:
    val = os.environ.get(key, "").strip().lower()
    if val in ("0", "false", "no", "off"):
        return False
    if val in ("1", "true", "yes", "on"):
        return True
    return default


def verify_enabled() -> bool:
    return _env_bool("BV_IMPLEMENT_VERIFY", True)


def auto_advance_enabled() -> bool:
    return _env_bool("BV_IMPLEMENT_AUTO_ADVANCE", True)


def duplicate_detect_enabled() -> bool:
    return _env_bool("BV_DUPLICATE_DETECT", True)


MAX_AUTO_ADVANCES = int(os.environ.get("BV_IMPLEMENT_MAX_ADVANCES", "5"))

# ---------------------------------------------------------------------------
# 1. Verify gate — parse and run verify commands from tasks_md
# ---------------------------------------------------------------------------

_VERIFY_RE = re.compile(
    r"^\s*[-*]?\s*verify:\s*`([^`]+)`",
    re.IGNORECASE | re.MULTILINE,
)

_STEP_CHECKBOX_RE = re.compile(
    r"^(\s*)-\s*\[([ xX])\]\s+(\d+(?:\.\d+)*)\s",
    re.MULTILINE,
)


def extract_verify_command(checklist_text: str) -> str | None:
    """Extract the verify command from a checklist item's text block.

    Looks for a line like:
        - verify: `python -c "from foo import bar"`
    in the text following the checklist item.
    """
    m = _VERIFY_RE.search(checklist_text or "")
    return m.group(1) if m else None


def extract_verify_for_step(tasks_md: str, step_prefix: str) -> str | None:
    """Find the verify command for a specific step number in the full tasks_md.

    Searches for the step (e.g. "1.3") and then looks at the indented lines
    following it for a verify: `...` pattern.
    """
    if not tasks_md or not step_prefix:
        return None

    lines = tasks_md.splitlines()
    in_step = False
    step_indent: int | None = None

    for line in lines:
        stripped = line.lstrip()
        indent = len(line) - len(stripped)

        # Check if this is our target step
        if not in_step:
            # Match: "- [ ] 1.3 ..." or "- [x] 1.3 ..."
            m = re.match(r"-\s*\[[ xX]\]\s+(" + re.escape(step_prefix) + r")\s", stripped)
            if m:
                in_step = True
                step_indent = indent
                continue
        else:
            # We're inside the step — look for verify line at deeper indent
            if stripped and indent <= step_indent:  # type: ignore[operator]
                # Back to same or lower indent — step block ended
                in_step = False
                continue
            vm = _VERIFY_RE.match(line)
            if vm:
                return vm.group(1)

    return None


def run_verify_command(
    workspace: str | Path,
    command: str,
    *,
    timeout_s: float = 60.0,
) -> tuple[bool, str]:
    """Run a verify command in the workspace directory.

    Returns (passed, output). Output includes both stdout and stderr.
    """
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=str(Path(workspace).resolve()),
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return False, f"verify command timed out after {int(timeout_s)}s: {command}"
    except OSError as e:
        return False, f"verify command failed to start: {e}"

    output = ((proc.stdout or "") + (proc.stderr or "")).strip()
    tail = output[-3000:] if len(output) > 3000 else output
    passed = proc.returncode == 0
    return passed, tail or f"(exit code {proc.returncode})"


# ---------------------------------------------------------------------------
# 2. Auto-advance — determine next step and build implement message
# ---------------------------------------------------------------------------


def parse_open_steps(tasks_md: str, *, item: Any | None = None) -> list[str]:
    """Parse all open (unchecked) step numbers.

    When ``item`` is provided, uses unified checklist + tasks_md progress.
    """
    if item is not None:
        from cecli.spec.progress import parse_open_step_ids

        return parse_open_step_ids(item)

    steps: list[str] = []
    for m in _STEP_CHECKBOX_RE.finditer(tasks_md or ""):
        done = m.group(2).lower() == "x"
        step_num = m.group(3)
        if not done:
            steps.append(step_num)
    return steps


def next_step_after(
    tasks_md: str,
    completed_step: str,
    *,
    item: Any | None = None,
) -> str | None:
    """Find the next open step after a completed one."""
    if item is not None:
        from cecli.spec.progress import next_open_implementation_step

        nxt = next_open_implementation_step(item, completed_step)
        return nxt.step_id if nxt else None

    open_steps = parse_open_steps(tasks_md)
    if not open_steps:
        return None

    from bright_vision_core.implement_workspace import step_sort_key

    completed_key = step_sort_key(completed_step)
    for step in open_steps:
        if step_sort_key(step) > completed_key:
            return step

    return open_steps[0] if open_steps else None


def build_auto_advance_message(step: str, step_text: str = "") -> str:
    """Build the implement message for auto-advancing to the next step."""
    msg = f"Implement only implementation task {step}"
    if step_text:
        # Include first line of the step description for context
        first_line = step_text.strip().splitlines()[0] if step_text.strip() else ""
        if first_line:
            msg += f": {first_line}"
    return msg


def extract_step_text(tasks_md: str, step: str) -> str:
    """Extract the full text of a step from tasks_md."""
    from cecli.spec.progress import extract_step_text_from_tasks_md

    return extract_step_text_from_tasks_md(tasks_md, step)


# ---------------------------------------------------------------------------
# 3. Duplicate output detection
# ---------------------------------------------------------------------------

DUPLICATE_SIMILARITY_THRESHOLD = 0.70
MIN_FILE_SIZE_FOR_CHECK = 200  # bytes — don't check very small files


def detect_duplicate_output(content: str) -> bool:
    """Detect if a file's content contains duplicated output.

    Checks if the second half is suspiciously similar to the first half,
    which indicates the model generated the same content twice.

    Returns True if duplicate detected.
    """
    if not duplicate_detect_enabled():
        return False

    content = content.strip()
    if len(content) < MIN_FILE_SIZE_FOR_CHECK:
        return False

    mid = len(content) // 2
    first_half = content[:mid]
    second_half = content[mid:]

    # Quick length-based pre-check — halves should be similar length if duplicated
    len_ratio = min(len(first_half), len(second_half)) / max(len(first_half), len(second_half))
    if len_ratio < 0.6:
        return False

    # Use SequenceMatcher for similarity
    ratio = SequenceMatcher(None, first_half, second_half).quick_ratio()
    if ratio < DUPLICATE_SIMILARITY_THRESHOLD:
        return False

    # Confirm with full ratio (quick_ratio is an upper bound)
    ratio = SequenceMatcher(None, first_half, second_half).ratio()
    if ratio >= DUPLICATE_SIMILARITY_THRESHOLD:
        logger.warning(
            "Duplicate output detected: first/second half similarity = %.2f (threshold: %.2f)",
            ratio,
            DUPLICATE_SIMILARITY_THRESHOLD,
        )
        return True

    return False


def deduplicate_output(content: str) -> str:
    """If content appears to be duplicated, return just the first half (trimmed cleanly).

    Tries to find a clean split point (blank line, class/function boundary) near the middle.
    """
    if not detect_duplicate_output(content):
        return content

    lines = content.splitlines(keepends=True)
    mid_line = len(lines) // 2

    # Look for a clean break point near the middle (blank line or duplicate start)
    best_break = mid_line
    for offset in range(min(20, mid_line)):
        for candidate in (mid_line + offset, mid_line - offset):
            if 0 <= candidate < len(lines):
                line = lines[candidate].strip()
                if not line:  # blank line
                    best_break = candidate
                    break
                # Check if the line after the break repeats content from the start
                if candidate < len(lines) - 1:
                    next_line = lines[candidate + 1].strip() if candidate + 1 < len(lines) else ""
                    first_line = lines[0].strip()
                    if next_line and next_line == first_line:
                        best_break = candidate
                        break
        else:
            continue
        break

    result = "".join(lines[:best_break]).rstrip()
    # Ensure file ends with newline
    if result and not result.endswith("\n"):
        result += "\n"
    return result


# ---------------------------------------------------------------------------
# Integration: check edited files for duplicates after a turn
# ---------------------------------------------------------------------------


def check_edited_files_for_duplicates(
    workspace: str | Path,
    edited_files: list[str],
) -> list[tuple[str, str]]:
    """Check recently edited files for duplicate content.

    Returns list of (file_path, deduplicated_content) for files that need fixing.
    """
    if not duplicate_detect_enabled():
        return []

    root = Path(workspace).resolve()
    fixes: list[tuple[str, str]] = []

    for rel_path in edited_files:
        path = root / rel_path
        if not path.is_file():
            continue
        # Only check Python, TypeScript, Rust source files
        if path.suffix not in (".py", ".ts", ".tsx", ".rs", ".js", ".jsx"):
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if detect_duplicate_output(content):
            deduped = deduplicate_output(content)
            if deduped != content:
                fixes.append((rel_path, deduped))

    return fixes
