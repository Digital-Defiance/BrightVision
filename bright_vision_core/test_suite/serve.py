"""Console entry: ``bright-vision-test-suite-serve`` (default :8743)."""

from __future__ import annotations

import argparse
import os
import sys

from bright_vision_core.test_suite.ports import orchestrator_port


def run(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="BrightVision test-suite HTTP server (Test Lab)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--port",
        type=int,
        default=orchestrator_port(),
    )
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args(argv)
    os.environ.setdefault("BV_TEST_ORCHESTRATOR_PORT", str(args.port))

    root = os.environ.get("BRIGHT_VISION_ENGINE") or os.environ.get("BV_ROOT")
    if root:
        os.environ.setdefault("BV_ROOT", root)

    try:
        import uvicorn
    except ImportError:
        print("uvicorn is required: pip install uvicorn", file=sys.stderr)
        sys.exit(1)

    print(f"Test suite orchestrator http://{args.host}:{args.port}")
    uvicorn.run(
        "bright_vision_core.test_suite.http:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="warning",
    )


def main() -> None:
    run()


if __name__ == "__main__":
    main()
