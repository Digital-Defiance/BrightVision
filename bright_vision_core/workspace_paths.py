"""On-disk paths for BrightVision workspace metadata (under the Cecli project tree)."""

from __future__ import annotations

import shutil
import threading
from pathlib import Path

# Shared with Cecli agent state (``.cecli/agents/``, ``sessions/``, ``logs/``, …).
WORKSPACE_META_DIR = ".cecli"

# BrightVision-only subtrees (Cecli does not write these).
TODOS_FILE = "todos.json"
SPECS_DIR = "specs"
ATTACHMENTS_DIR = "attachments"

# One-time migration from retired product paths.
LEGACY_WORKSPACE_META_DIRS = (".aider-vision", ".bright-vision", ".brightvision")

_migration_lock_guard = threading.Lock()
_migration_locks: dict[str, threading.Lock] = {}


def _migration_lock(root: Path) -> threading.Lock:
    key = str(root)
    with _migration_lock_guard:
        lock = _migration_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _migration_locks[key] = lock
        return lock


def _try_rename(src: Path, dest: Path) -> None:
    """Move ``src`` → ``dest``; ignore missing sources (concurrent migration races)."""
    if not src.exists():
        return
    if dest.exists():
        return
    try:
        src.rename(dest)
    except FileNotFoundError:
        return
    except OSError:
        if src.is_file():
            try:
                shutil.copy2(src, dest)
                src.unlink(missing_ok=True)
            except OSError:
                pass


def _merge_legacy_dir_into_cecli(target: Path, legacy: Path) -> None:
    if not legacy.is_dir():
        return
    for child in list(legacy.iterdir()):
        if not child.exists():
            continue
        dest = target / child.name
        if dest.exists():
            if child.is_dir() and dest.is_dir():
                for sub in list(child.iterdir()):
                    if not sub.exists():
                        continue
                    sub_dest = dest / sub.name
                    if not sub_dest.exists():
                        _try_rename(sub, sub_dest)
            continue
        _try_rename(child, dest)
    shutil.rmtree(legacy, ignore_errors=True)


def workspace_meta_dir(workspace: str | Path) -> Path:
    """
    Resolve ``<workspace>/.cecli`` and ensure BrightVision metadata lives there.

    Cecli already uses ``.cecli/agents/…``, ``sessions/``, ``logs/``, etc.
    BrightVision adds ``todos.json``, ``specs/``, ``attachments/`` alongside them.
    """
    root = Path(workspace).resolve()
    target = root / WORKSPACE_META_DIR

    with _migration_lock(root):
        target.mkdir(parents=True, exist_ok=True)
        if (target / TODOS_FILE).is_file():
            return target
        for legacy_name in LEGACY_WORKSPACE_META_DIRS:
            legacy = root / legacy_name
            if legacy.is_dir():
                _merge_legacy_dir_into_cecli(target, legacy)
            if (target / TODOS_FILE).is_file():
                break

    return target


def todos_json_path(workspace: str | Path) -> Path:
    return workspace_meta_dir(workspace) / TODOS_FILE


def specs_root(workspace: str | Path) -> Path:
    return workspace_meta_dir(workspace) / SPECS_DIR


def attachments_dir(workspace: str | Path) -> Path:
    return workspace_meta_dir(workspace) / ATTACHMENTS_DIR


def attachments_prefix() -> str:
    return f"{WORKSPACE_META_DIR}/{ATTACHMENTS_DIR}/"
