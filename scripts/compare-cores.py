#!/usr/bin/env python3
"""Compare aider-vision-core/aider_vision_core vs bright-vision-core/cecli file-by-file.

Usage:
  python3 scripts/compare-cores.py              # summary
  python3 scripts/compare-cores.py --list vision-only
  python3 scripts/compare-cores.py --list differ
  python3 scripts/compare-cores.py --diff http_api.py
  python3 scripts/compare-cores.py --diff main.py
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "aider-vision-core" / "aider_vision_core"
DST = ROOT / "bright-vision-core" / "cecli"

VISION_ONLY = {
    "http_api.py",
    "http_auth.py",
    "session.py",
    "vision_runtime.py",
    "vision_serve.py",
    "cli_serve.py",
    "git_workspace.py",
    "workspace_todos.py",
    "todo_markdown.py",
    "todo_spec_generate.py",
    "todo_spec_jobs.py",
    "headless_stdio.py",
    "brand.py",
    "event_io.py",
    "gui_progress.py",
    "analytics.py",
    "cli_serve.py",
}

# Shared files where Vision fork likely has intentional deltas — review merges.
MERGE_CANDIDATES = {
    "main.py",
    "repo.py",
    "io.py",
    "args.py",
    "coders/base_coder.py",
    "repomap.py",
    "waiting.py",
    "watch.py",
    "gui_progress.py",
}


def iter_py(root: Path) -> set[str]:
    if not root.exists():
        return set()
    out: set[str] = set()
    for p in root.rglob("*.py"):
        if "__pycache__" in p.parts:
            continue
        out.add(p.relative_to(root).as_posix())
    return out


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def diff_stat(rel: str) -> str:
    sp, dp = SRC / rel, DST / rel
    if not sp.exists():
        return "missing in aider_vision_core"
    if not dp.exists():
        return "missing in cecli (port from Vision)"
    r = subprocess.run(["diff", "-u", str(dp), str(sp)], capture_output=True, text=True)
    adds = dels = 0
    for line in r.stdout.splitlines():
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            adds += 1
        elif line.startswith("-"):
            dels += 1
    return f"+{adds}/-{dels} lines vs cecli"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", choices=["vision-only", "only-src", "only-dst", "differ", "identical"])
    ap.add_argument("--diff", metavar="REL_PATH", help="Show unified diff (cecli → vision)")
    args = ap.parse_args()

    if not SRC.is_dir():
        print(f"Missing {SRC}", file=sys.stderr)
        return 1
    if not DST.is_dir():
        print(f"Missing {DST}", file=sys.stderr)
        return 1

    s, d = iter_py(SRC), iter_py(DST)
    only_src = sorted(s - d)
    only_dst = sorted(d - s)
    both = sorted(s & d)
    identical = [f for f in both if sha(SRC / f) == sha(DST / f)]
    differ = [f for f in both if f not in identical]

    if args.diff:
        rel = args.diff
        sp, dp = SRC / rel, DST / rel
        if not sp.exists():
            print(f"No {rel} in aider_vision_core", file=sys.stderr)
            return 1
        if not dp.exists():
            print(f"# {rel} only exists in aider_vision_core — copy as new file")
            print(sp.read_text())
            return 0
        return subprocess.call(["diff", "-u", str(dp), str(sp)])

    if args.list == "vision-only":
        for f in sorted(VISION_ONLY):
            if f in only_src or f in differ:
                print(f"{f}\t{diff_stat(f)}")
        return 0
    if args.list == "only-src":
        for f in only_src:
            tag = "VISION" if f in VISION_ONLY or f.split("/")[0] in ("http", "vision", "todo", "workspace") else ""
            print(f"{f}\t{tag}")
        return 0
    if args.list == "only-dst":
        for f in only_dst:
            print(f)
        return 0
    if args.list == "differ":
        for f in differ:
            mark = "MERGE?" if f in MERGE_CANDIDATES else ""
            print(f"{f}\t{diff_stat(f)}\t{mark}")
        return 0
    if args.list == "identical":
        for f in identical:
            print(f)
        return 0

    print("Core file comparison (aider_vision_core vs cecli)")
    print(f"  aider_vision_core: {len(s)} .py files")
    print(f"  cecli:             {len(d)} .py files")
    print(f"  only Vision tree:  {len(only_src)}")
    print(f"  only cecli:        {len(only_dst)}")
    print(f"  shared path:       {len(both)} ({len(identical)} identical, {len(differ)} differ)")
    print()
    print("Replay commits? Unlikely — histories diverged. Use:")
    print("  python3 scripts/compare-cores.py --list vision-only")
    print("  python3 scripts/compare-cores.py --list differ")
    print("  python3 scripts/compare-cores.py --diff main.py")
    print()
    print("See docs/CORE_FILE_MERGE.md for tiered merge rules.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
