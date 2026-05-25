#!/usr/bin/env python3
"""
Roadmap #19: verify superproject workspace + engine submodule (bright-vision-core default).

Run from repo root (after activate.sh):

    python scripts/verify_submodule_workspace.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ENGINE_NAME = os.environ.get("BRIGHT_VISION_ENGINE", "bright-vision-core")
CORE = ROOT / ENGINE_NAME

if ENGINE_NAME == "bright-vision-core":
    SUB_REL = "bright-vision-core/bright_vision_core/session.py"
    PKG = "bright_vision_core"
else:
    SUB_REL = "aider-vision-core/aider_vision_core/session.py"
    PKG = "aider_vision_core"


def _python_hint() -> str:
    return (
        f"Install deps: source activate.sh (installs editable {ENGINE_NAME})"
    )


def main() -> int:
    if not CORE.is_dir():
        print(f"FAIL: missing submodule checkout at {CORE}")
        return 1

    sys.path.insert(0, str(CORE))

    try:
        event_io = __import__(f"{PKG}.event_io", fromlist=["EventIO"])
        git_ws = __import__(f"{PKG}.git_workspace", fromlist=["RepoSet", "create_git_workspace", "discover_submodule_paths"])
        session_mod = __import__(f"{PKG}.session", fromlist=["Session"])
        EventIO = event_io.EventIO
        RepoSet = git_ws.RepoSet
        create_git_workspace = git_ws.create_git_workspace
        discover_submodule_paths = git_ws.discover_submodule_paths
        Session = session_mod.Session
    except ModuleNotFoundError as err:
        print(f"FAIL: cannot import {PKG} ({err})")
        print(_python_hint())
        return 1

    checks: list[tuple[str, bool]] = []

    paths = discover_submodule_paths(str(ROOT))
    checks.append(
        (
            f"git discovers {ENGINE_NAME} submodule",
            ENGINE_NAME in paths,
        )
    )

    io = EventIO(yes=True, echo_to_console=False)
    ws = create_git_workspace(io, [], str(ROOT))
    checks.append(("create_git_workspace is RepoSet", isinstance(ws, RepoSet)))
    checks.append(
        (
            f"path_in_repo({SUB_REL})",
            bool(ws.path_in_repo(SUB_REL)),
        )
    )

    sub_root = ws.repo_for_rel_path(SUB_REL).root if isinstance(ws, RepoSet) else ""
    checks.append(
        (
            f"submodule repo root is {ENGINE_NAME}",
            sub_root.endswith(ENGINE_NAME),
        )
    )

    session = Session.create(
        str(ROOT),
        files=[str(ROOT / SUB_REL)],
        yes=True,
        dry_run=True,
    )
    inchat = session.coder.get_inchat_relative_files()
    checks.append(
        (
            "Session adds submodule file to chat",
            SUB_REL.replace("\\", "/") in [p.replace("\\", "/") for p in inchat],
        )
    )
    checks.append(
        ("coder.root is superproject", Path(session.coder.root).resolve() == ROOT.resolve())
    )

    failed = 0
    for name, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'}: {name}")
        if not ok:
            failed += 1

    if failed:
        print(f"\n{failed} check(s) failed.")
        return 1
    print(f"\nAll submodule workspace checks passed ({ENGINE_NAME}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
