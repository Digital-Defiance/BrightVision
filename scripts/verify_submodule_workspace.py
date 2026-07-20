#!/usr/bin/env python3
"""
Verify superproject workspace + cecli submodule + parent bright_vision_core.

Run from repo root (after activate.sh):

    python scripts/verify_submodule_workspace.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = "bright_vision_core"
VISION_REL = "bright_vision_core/session.py"


def _cecli_submodule_name() -> str | None:
    if (ROOT / "cecli").is_dir():
        return "cecli"
    if (ROOT / "BrightVision-core").is_dir():
        return "BrightVision-core"
    return None


def main() -> int:
    if not (ROOT / VISION_REL).is_file():
        print(f"FAIL: missing {VISION_REL} (run from BrightVision repo root)")
        return 1

    cecli_name = _cecli_submodule_name()
    if not cecli_name:
        print("FAIL: no cecli submodule (cecli/ or BrightVision-core/)")
        return 1

    bd_root = ROOT / "brightdate-python"
    if not (bd_root / "pyproject.toml").is_file():
        print("FAIL: brightdate-python submodule missing (git submodule update --init brightdate-python)")
        return 1

    try:
        event_io = __import__(f"{PKG}.event_io", fromlist=["EventIO"])
        git_ws = __import__(
            f"{PKG}.git_workspace",
            fromlist=["RepoSet", "create_git_workspace", "discover_submodule_paths"],
        )
        session_mod = __import__(f"{PKG}.session", fromlist=["Session"])
        EventIO = event_io.EventIO
        RepoSet = git_ws.RepoSet
        create_git_workspace = git_ws.create_git_workspace
        discover_submodule_paths = git_ws.discover_submodule_paths
        Session = session_mod.Session
    except ModuleNotFoundError as err:
        print(f"FAIL: cannot import {PKG} ({err})")
        print("Install: source activate.sh")
        return 1

    try:
        import brightdate as _bd

        checks_bd = abs(_bd.bd_from_unix_ms(_bd.J2000_UNIX_MS)) < 1e-12
    except ImportError as err:
        print(f"FAIL: cannot import brightdate ({err})")
        print("Install: source activate.sh (pip install -e brightdate-python)")
        return 1

    checks: list[tuple[str, bool]] = []
    checks.append(("brightdate J2000 epoch", checks_bd))

    paths = discover_submodule_paths(str(ROOT))
    checks.append((f"git discovers {cecli_name} submodule", cecli_name in paths))

    io = EventIO(yes=True, echo_to_console=False)
    ws = create_git_workspace(io, [], str(ROOT))
    checks.append(("create_git_workspace is RepoSet", isinstance(ws, RepoSet)))
    vision_path = ROOT / VISION_REL
    checks.append((f"{VISION_REL} on disk", vision_path.is_file()))
    in_repo = bool(ws.path_in_repo(VISION_REL)) if vision_path.is_file() else False
    if vision_path.is_file() and not in_repo:
        print(
            f"NOTE: {VISION_REL} is not git-tracked; "
            "run `git add bright_vision_core/` for /add on Vision layer files."
        )
    else:
        checks.append((f"path_in_repo({VISION_REL})", in_repo))

    session = Session.create(
        str(ROOT),
        files=[str(ROOT / VISION_REL)],
        yes=True,
        dry_run=True,
    )
    inchat = session.coder.get_inchat_relative_files()
    checks.append(
        (
            "Session adds bright_vision_core file to chat",
            VISION_REL.replace("\\", "/") in [p.replace("\\", "/") for p in inchat],
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
    print("\nAll workspace checks passed (parent bright_vision_core + cecli submodule).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
