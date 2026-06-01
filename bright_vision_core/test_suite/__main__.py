"""``python -m bright_vision_core.test_suite digest PATH`` or full suite run."""

from __future__ import annotations

import sys

from bright_vision_core.test_suite.cli import _cmd_digest, main

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "digest":
        raise SystemExit(_cmd_digest(sys.argv[2:]))
    raise SystemExit(main())
