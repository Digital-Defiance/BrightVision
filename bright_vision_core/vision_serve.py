"""HTTP API server for BrightVision (``bright-vision-core-serve``)."""

from __future__ import annotations

import argparse
import os
import sys


def run(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="BrightVision Vision HTTP API server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8741)
    parser.add_argument("--reload", action="store_true", help="Reload on code changes")
    parser.add_argument(
        "--generate-token",
        action="store_true",
        help="Print a random token suitable for BRIGHT_VISION_TOKEN and exit",
    )
    args = parser.parse_args(argv)

    from bright_vision_core.http_auth import (
        configure_auth,
        generate_token,
        startup_message,
        validate_listen_address,
    )

    if args.generate_token:
        print(generate_token())
        return

    validate_listen_address(args.host)
    configure_auth(args.host)

    from bright_vision_core.vision_runtime import configure_vision_runtime

    if os.environ.get("BRIGHT_VISION_HEADLESS") == "1":
        configure_vision_runtime()
    else:
        print(startup_message(args.host))

    # Eager-load FastAPI app (cecli + LiteLLM cold import can take 30s+). Log after load so
    # e2e / Test Lab health polls do not time out while uvicorn is still importing the module.
    import time

    print("[bright-vision] loading http_api…", file=sys.stderr, flush=True)
    t0 = time.monotonic()
    from bright_vision_core.http_api import app

    print(
        f"[bright-vision] http_api loaded in {time.monotonic() - t0:.1f}s",
        file=sys.stderr,
        flush=True,
    )

    try:
        from bright_vision_core.agent_turn import AGENT_TURN_FEATURES

        root = os.environ.get("BRIGHT_VISION_ROOT") or os.environ.get("BV_ROOT") or "unknown"
        print(
            f"[bright-vision] engine_root={root} agent_turn_features={AGENT_TURN_FEATURES}",
            file=sys.stderr,
            flush=True,
        )
    except Exception:
        pass

    try:
        import uvicorn
    except ImportError:
        print("uvicorn is required: pip install uvicorn", file=sys.stderr)
        sys.exit(1)

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="warning",
        access_log=not os.environ.get("BRIGHT_VISION_HEADLESS"),
    )
