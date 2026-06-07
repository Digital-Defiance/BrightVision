"""Ground spec-focus implement turns in on-disk workspace facts (avoid ls loops)."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

from bright_vision_core.spec_steering import workspace_lib_missing
from bright_vision_core.workspace_todos import ChecklistItem

_PATH_IN_CHECKLIST = re.compile(
    r"(?:`((?:lib|test)/[\w./-]+)`|((?:lib|test)/[\w./-]+))",
    re.IGNORECASE,
)

_SNAPSHOT_DIRS = ("lib", "test")
_MAX_LIST_FILES = 24


def list_workspace_test_files(workspace: str | Path, *, limit: int = _MAX_LIST_FILES) -> list[str]:
    return _list_tree_files(Path(workspace).resolve(), "test", limit=limit)


def _list_tree_files(root: Path, subdir: str, *, limit: int = _MAX_LIST_FILES) -> list[str]:
    base = root / subdir
    if not base.is_dir():
        return []
    out: list[str] = []
    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        if path.name.startswith("."):
            continue
        rel = path.relative_to(root).as_posix()
        out.append(rel)
        if len(out) >= limit:
            break
    return out


def paths_from_checklist_text(text: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for match in _PATH_IN_CHECKLIST.finditer(text or ""):
        raw = (match.group(1) or match.group(2) or "").strip().rstrip("/")
        if not raw or raw in seen:
            continue
        seen.add(raw)
        found.append(raw)
    return found


def deliverable_paths_exist(workspace: str | Path, paths: list[str]) -> bool:
    """True when every path is an existing file or non-empty directory."""
    root = Path(workspace).resolve()
    if not paths:
        return False
    for rel in paths:
        target = root / rel
        if target.is_file():
            continue
        if target.is_dir() and any(target.iterdir()):
            continue
        return False
    return True


def first_open_checklist_item(checklist: list[ChecklistItem]) -> ChecklistItem | None:
    for entry in checklist:
        if not entry.done and entry.text.strip():
            return entry
    return None


def build_workspace_snapshot_lines(workspace: str | Path) -> list[str]:
    root = Path(workspace).resolve()
    lines = ["## Workspace snapshot (verified on disk — do **not** ls to rediscover)"]
    pubspec = root / "pubspec.yaml"
    if pubspec.is_file():
        lines.append("- `pubspec.yaml` — present")
    else:
        lines.append("- `pubspec.yaml` — **missing**")

    for sub in _SNAPSHOT_DIRS:
        files = _list_tree_files(root, sub)
        if not files:
            lines.append(f"- `{sub}/` — **empty or missing**")
            continue
        preview = ", ".join(f"`{f}`" for f in files[:8])
        extra = f" (+{len(files) - 8} more)" if len(files) > 8 else ""
        lines.append(f"- `{sub}/` — {len(files)} file(s): {preview}{extra}")
    return lines


def build_implement_next_action_lines(
    workspace: str | Path,
    checklist: list[ChecklistItem],
    *,
    resume: bool,
) -> list[str]:
    lines = ["## Next action (this turn)"]
    focus = first_open_checklist_item(checklist)
    if focus is None:
        lines.append(
            "All checklist items are marked done. Run project tests if applicable, "
            "then update the task status — **no ls/Grep exploration**."
        )
        return lines

    paths = paths_from_checklist_text(focus.text)
    lower = focus.text.lower()
    on_disk = deliverable_paths_exist(workspace, paths) if paths else False
    test_files = _list_tree_files(Path(workspace).resolve(), "test")

    if ("test" in lower or "verify" in lower) and test_files:
        target = next((f for f in test_files if "test" in f), test_files[0])
        lines.append(
            f"Focus checklist: **{focus.text.strip()}** — test file(s) already on disk."
        )
        lines.append(
            f"1. **ReadRange** `{target}` with `@000` / `000@` once\n"
            f"2. **EditText** only if tests need fixes\n"
            f"3. BrightVision runs **`flutter test`** at end of this turn\n"
            f"4. Mark checklist item done after tests pass\n"
            f"**Do not** call ls, Grep, GitStatus, or repeat ReadRange on the same file."
        )
    elif on_disk and ("test" in lower or "verify" in lower):
        test_files = _list_tree_files(Path(workspace).resolve(), "test")
        target = next((f for f in test_files if "test" in f), test_files[0] if test_files else None)
        if target:
            lines.append(
                f"Focus checklist: **{focus.text.strip()}** — deliverable files already exist."
            )
            lines.append(
                f"1. **ReadRange** `{target}` with `@000` / `000@` once\n"
                f"2. **EditText** only if tests need fixes\n"
                f"3. BrightVision will run **`flutter test`** when this turn edits test files\n"
                f"4. Mark checklist item done after tests pass\n"
                f"**Do not** call ls, Grep, GitStatus, or repeat ReadRange on the same file."
            )
        else:
            lines.append(
                f"Focus: **{focus.text.strip()}** — create tests with **ContextManager** + "
                "**ReadRange** + **EditText** (one file). **No ls.**"
            )
    elif on_disk:
        target = paths[0] if paths else "lib/"
        lines.append(
            f"Focus checklist: **{focus.text.strip()}** — paths exist on disk (`{target}`)."
        )
        lines.append(
            f"**ReadRange** the target source file, then **EditText** to finish. **No ls.**"
        )
    elif workspace_lib_missing(workspace):
        lines.append(f"Focus checklist: **{focus.text.strip()}**")
        lines.append(
            "**ContextManager** to scaffold `lib/` (and `test/` if needed), then **ReadRange** + "
            "**EditText** on one file. **Do not ls** empty directories."
        )
    elif resume:
        lines.append(f"Focus checklist: **{focus.text.strip()}**")
        lines.append(
            "Use **ReadRange** + **EditText** on **one file** for this item. "
            "**Do not** ls, Grep, or GitStatus — use the workspace snapshot above."
        )
    else:
        lines.append(f"Focus checklist: **{focus.text.strip()}**")
        lines.append(
            "Work this item only: **ContextManager** / **ReadRange** / **EditText**. **No ls.**"
        )
    return lines


def build_implement_workspace_block(
    workspace: str | Path,
    checklist: list[ChecklistItem] | None,
    *,
    resume: bool,
) -> str:
    """Markdown block injected on implement / resume turns."""
    parts = build_workspace_snapshot_lines(workspace)
    if checklist:
        parts.append("")
        parts.extend(build_implement_next_action_lines(workspace, checklist, resume=resume))
    parts.append("")
    parts.append(
        "**Hard rule:** Do not batch UpdateTodoList JSON with other tool args. "
        "One tool per call. Do not call **ls** when this snapshot is present."
    )
    return "\n".join(parts)


def edited_dart_test_files(edited_files: list[str]) -> list[str]:
    out: list[str] = []
    for raw in edited_files:
        rel = raw.replace("\\", "/").lstrip("./")
        if rel.startswith("test/") and rel.endswith("_test.dart"):
            out.append(rel)
    return out


def run_flutter_tests(workspace: str | Path, test_paths: list[str]) -> tuple[bool, str]:
    """Run ``flutter test`` on specific files; return (passed, combined output)."""
    root = Path(workspace).resolve()
    if not (root / "pubspec.yaml").is_file():
        return False, "pubspec.yaml missing — cannot run flutter test"
    if not test_paths:
        return False, "no test paths"
    cmd = ["flutter", "test", *test_paths]
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        return False, "flutter test timed out after 300s"
    except FileNotFoundError:
        return False, "flutter not found on PATH"
    out = (proc.stdout or "") + (proc.stderr or "")
    tail = out.strip()[-4000:] if out.strip() else "(no output)"
    return proc.returncode == 0, tail
