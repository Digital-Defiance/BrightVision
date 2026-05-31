"""CLI entry: ``bright-vision-test-everything`` / ``yarn test:everything``."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from bright_vision_core.test_suite.runner import run_suite
from bright_vision_core.test_suite.timing import repo_root
from bright_vision_core.test_suite.log_digest import agent_digest_file
from bright_vision_core.test_suite.transcript import TranscriptWriter, resolve_transcript_path


def _cmd_digest(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Compress a Test Lab transcript for agents")
    parser.add_argument("path", help="Transcript .log under .bright-vision/test-suite-runs/")
    parser.add_argument("--max-chars", type=int, default=120_000)
    parser.add_argument(
        "--keep-heartbeats",
        action="store_true",
        help="Do not collapse still-running lines",
    )
    parser.add_argument("-o", "--output", help="Write digest to file instead of stdout")
    args = parser.parse_args(argv)
    digest = agent_digest_file(
        args.path,
        max_chars=args.max_chars,
        collapse_heartbeats=not args.keep_heartbeats,
    )
    if args.output:
        Path(args.output).write_text(digest, encoding="utf-8")
        print(f"Wrote {len(digest)} chars to {args.output}", file=sys.stderr)
    else:
        print(digest)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the full BrightVision confidence suite")
    parser.add_argument("--skip-llm", action="store_true")
    parser.add_argument("--skip-gpu", action="store_true")
    parser.add_argument("--skip-time", action="store_true")
    parser.add_argument(
        "--logged",
        action="store_true",
        help="Write full transcript to .bright-vision/test-suite-runs/ "
        "(or TEST_EVERYTHING_LOG path)",
    )
    parser.add_argument(
        "--transcript",
        metavar="PATH",
        help="Transcript file path (implies --logged)",
    )
    args = parser.parse_args(argv)

    os.environ.setdefault("BV_ROOT", str(repo_root()))

    save_transcript = args.logged or bool(args.transcript)
    writer: TranscriptWriter | None = None
    if save_transcript:
        log_path = resolve_transcript_path(override=args.transcript)
        writer = TranscriptWriter(log_path)
        print(f"Transcript: {log_path}", file=sys.stderr)

    def on_event(event: dict) -> None:
        if writer:
            writer.write_event(event)
        t = event.get("type")
        if t == "step_line":
            stream = event.get("stream", "stdout")
            print(event.get("line", ""), file=sys.stderr if stream == "stderr" else sys.stdout)
        elif t == "step_started":
            print(f"\n> {event.get('label')}", file=sys.stderr)
            print("-" * 80, file=sys.stderr)
        elif t == "step_finished":
            mark = "SUCCESS" if event.get("ok") else "FAIL"
            print(f"[ {mark} ]", file=sys.stderr)
            ga = event.get("gpuAvg")
            gp = event.get("gpuPeak")
            if ga is not None:
                print(f"gpu     avg {ga}%  peak {gp}%", file=sys.stderr)
        elif t == "run_finished":
            if event.get("ok"):
                print("\n> ALL TEST SUITES SUCCESSFUL <", file=sys.stderr)
            else:
                print("\nOne or more steps failed.", file=sys.stderr)

    try:
        ok = run_suite(
            skip_llm=args.skip_llm,
            skip_gpu=args.skip_gpu,
            skip_time=args.skip_time,
            on_event=on_event,
        )
    finally:
        if writer:
            writer.close()
            print(f"Transcript saved: {writer.path}", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "digest":
        raise SystemExit(_cmd_digest(sys.argv[2:]))
    raise SystemExit(main())
