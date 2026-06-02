"""Workspace path helpers (existence checks for context attach)."""

from __future__ import annotations

from pathlib import Path

SPEC_LAYER_FILENAMES = frozenset({"requirements.md", "design.md", "tasks.md"})


def _normalize_repo_relative(raw: str) -> str:
    rel = str(raw).replace("\\", "/").strip()
    while rel.startswith("./"):
        rel = rel[2:]
    return rel


def normalize_workspace_relative(raw: str, workspace: str | Path) -> Path | None:
    """Resolve *raw* under *workspace*; return absolute path or None if outside workspace."""
    root = Path(workspace).resolve()
    p = Path(raw.strip().lstrip("@"))
    if not p.is_absolute():
        p = root / p
    p = p.resolve()
    try:
        p.relative_to(root)
    except ValueError:
        return None
    return p


def workspace_relative_posix(path: Path, workspace: str | Path) -> str:
    root = Path(workspace).resolve()
    return path.resolve().relative_to(root).as_posix()


def filter_existing_workspace_paths(
    workspace: str | Path, paths: list[str]
) -> tuple[list[str], list[str]]:
    """Return ``(existing_rel_posix, missing_raw)`` for each requested path."""
    existing: list[str] = []
    missing: list[str] = []
    for raw in paths:
        if not str(raw).strip():
            continue
        resolved = normalize_workspace_relative(raw, workspace)
        if resolved is None:
            missing.append(raw)
            continue
        if resolved.is_file():
            existing.append(workspace_relative_posix(resolved, workspace))
        else:
            missing.append(raw)
    return existing, missing


def edited_spec_layers_for_todo(edited_files: list[str], todo_id: str) -> bool:
    """True when *edited_files* touches ``.cecli/specs/{todo_id}/`` layer markdown."""
    prefixes = {f".cecli/specs/{todo_id}/"}
    if len(todo_id) > 8:
        prefixes.add(f".cecli/specs/{todo_id[:8]}/")
    for raw in edited_files:
        rel = _normalize_repo_relative(raw)
        for prefix in prefixes:
            if not rel.startswith(prefix):
                continue
            if rel[len(prefix) :] in SPEC_LAYER_FILENAMES:
                return True
    return False
