"""Spawn Vision HTTP API for suite ``llm:core`` (pytest uses real :8741, not in-process TestClient)."""

from __future__ import annotations

import os
import signal
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

HealthLineCallback = Callable[[str], None]


def vision_core_port() -> int:
    try:
        return int(os.environ.get("BV_CORE_PORT", "8741"))
    except ValueError:
        return 8741


def vision_base_url(port: int | None = None) -> str:
    p = vision_core_port() if port is None else port
    return f"http://127.0.0.1:{p}"


def wait_vision_health(
    base_url: str,
    *,
    timeout_s: float = 300.0,
    on_line: HealthLineCallback | None = None,
) -> None:
    url = f"{base_url.rstrip('/')}/health"
    deadline = time.monotonic() + timeout_s
    last_log = 0.0
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        now = time.monotonic()
        if on_line and now - last_log >= 15.0:
            elapsed = int(now - (deadline - timeout_s))
            on_line(f"[vision-core] waiting for /health ({elapsed}s/{int(timeout_s)}s)")
            last_log = now
        time.sleep(0.5)
    raise RuntimeError(f"Vision API not healthy at {url} after {int(timeout_s)}s")


def spawn_vision_api(
    cwd: Path,
    env: dict[str, str],
    *,
    on_line: HealthLineCallback | None = None,
) -> subprocess.Popen[str]:
    port = vision_core_port()
    serve = cwd / ".venv" / "bin" / "bright-vision-core-serve"
    if not serve.is_file():
        raise FileNotFoundError(f"Missing {serve} — run: source activate.sh")
    if on_line:
        on_line(f"[vision-core] spawning {serve.name} on 127.0.0.1:{port}")
    proc = subprocess.Popen(
        [str(serve), "--host", "127.0.0.1", "--port", str(port)],
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        start_new_session=os.name != "nt",
    )
    base = vision_base_url(port)
    wait_vision_health(base, timeout_s=300.0, on_line=on_line)
    if on_line:
        on_line(f"[vision-core] ready at {base}")
    return proc


def terminate_vision_api(proc: subprocess.Popen[str] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        if os.name != "nt":
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        else:
            proc.terminate()
    except ProcessLookupError:
        pass
    except OSError:
        proc.kill()
    try:
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:
        proc.kill()
