"""CLI entry: ``bright-vision-test-everything`` / ``yarn test:everything``."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from bright_vision_core.test_suite.manifest import SuiteRunOptions
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
        "--fail-fast",
        action="store_true",
        help="Stop the suite after the first failing step.",
    )
    parser.add_argument(
        "--use-brightdate",
        action="store_true",
        help="Show step/run durations and ETC in BrightDate (BD/md); bgpucap uses %%Ws/%%Wt.",
    )
    parser.add_argument(
        "--spec-gen-phased",
        action="store_true",
        help="Run phased spec-generate LLM e2e (3 jobs; slow on llama3.2:3b). "
        "Same as E2E_SPEC_GEN_PHASED=1 for the e2e:llm step.",
    )
    parser.add_argument(
        "--llm-router",
        action="store_true",
        help="Add yarn test:e2e:llm:router (fast+heavy model turns; slow).",
    )
    parser.add_argument(
        "--cloud-llm",
        action="store_true",
        help="Add yarn test:cloud-llm (needs cloud-llm.env).",
    )
    parser.add_argument(
        "--verify-ears",
        action="store_true",
        help="Add yarn verify:ears (cecli/tests/spec unit + HTTP EARS routes).",
    )
    parser.add_argument(
        "--shipped-scenarios",
        action="store_true",
        help="Add Playwright shipped-scenarios matrix.",
    )
    parser.add_argument(
        "--strict-phased-pytest",
        action="store_true",
        help="Fail llm:core if phased pytest hits EARS gate (default: skip).",
    )
    parser.add_argument(
        "--from-step",
        metavar="STEP_ID",
        help="Skip steps before STEP_ID (e.g. llm:core, e2e:llm). Resume a partial suite.",
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
        elif t == "step_skipped":
            print(f"[ SKIP ] {event.get('label', event.get('stepId', ''))}", file=sys.stderr)
        elif t == "step_finished":
            mark = "SUCCESS" if event.get("ok") else "FAIL"
            print(f"[ {mark} ]", file=sys.stderr)
            ga = event.get("gpuAvg")
            gp = event.get("gpuPeak")
            if ga is not None:
                print(f"gpu     avg {ga}%  peak {gp}%", file=sys.stderr)
            mp = event.get("memPeak")
            if mp is not None:
                print(
                    f"memory  avg {event.get('memAvg', '?')}%  peak {mp}%",
                    file=sys.stderr,
                )
            pr = event.get("memPressurePeak")
            if pr is not None:
                print(f"pressure peak {pr}", file=sys.stderr)
        elif t == "run_finished":
            if event.get("ok"):
                print("\n> ALL TEST SUITES SUCCESSFUL <", file=sys.stderr)
            else:
                print("\nOne or more steps failed.", file=sys.stderr)

    try:
        run_options = SuiteRunOptions(
            skip_llm=args.skip_llm,
            spec_gen_phased=args.spec_gen_phased,
            llm_router=args.llm_router,
            cloud_llm=args.cloud_llm,
            verify_ears=args.verify_ears,
            shipped_scenarios=args.shipped_scenarios,
            strict_phased_pytest=args.strict_phased_pytest,
        )
        ok = run_suite(
            skip_llm=args.skip_llm,
            skip_gpu=args.skip_gpu,
            skip_time=args.skip_time,
            use_brightdate=args.use_brightdate,
            fail_fast=args.fail_fast,
            run_options=run_options,
            on_event=on_event,
            start_from_step_id=args.from_step,
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
