"""Background test-suite runs with SSE subscriber fan-out."""

from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from bright_vision_core.test_suite.runner import run_suite
from bright_vision_core.test_suite.transcript import TranscriptWriter, resolve_transcript_path

RunStatus = Literal["pending", "running", "completed", "error", "cancelled"]

_MAX_RUNS = 16
_RUN_TTL_S = 7200
_STALE_RUN_S = 4 * 3600  # no events while "running" for 4h → treat as stuck


@dataclass
class TestSuiteRun:
    run_id: str
    status: RunStatus = "pending"
    ok: bool = False
    error: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)
    transcript_path: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    _cancel: bool = False
    _cond: threading.Condition = field(default_factory=threading.Condition)
    _thread: threading.Thread | None = None

    def append_event(self, event: dict[str, Any]) -> None:
        with self._cond:
            self.events.append(event)
            self.updated_at = time.time()
            self._cond.notify_all()

    def wait_events(self, after_index: int, timeout: float = 30.0) -> list[dict[str, Any]]:
        deadline = time.time() + timeout
        with self._cond:
            while len(self.events) <= after_index and self.status in ("pending", "running"):
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                self._cond.wait(timeout=min(1.0, remaining))
            return self.events[after_index:]

    def request_cancel(self) -> None:
        self._cancel = True

    def cancelled(self) -> bool:
        return self._cancel


class TestSuiteJobStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._runs: dict[str, TestSuiteRun] = {}
        self._active_id: str | None = None

    def _prune(self) -> None:
        now = time.time()
        stale = [rid for rid, r in self._runs.items() if now - r.updated_at > _RUN_TTL_S]
        for rid in stale:
            if rid != self._active_id:
                del self._runs[rid]
        while len(self._runs) > _MAX_RUNS:
            for rid, run in sorted(self._runs.items(), key=lambda x: x[1].updated_at):
                if rid != self._active_id:
                    del self._runs[rid]
                    break

    def active_run(self) -> TestSuiteRun | None:
        with self._lock:
            if self._active_id:
                return self._runs.get(self._active_id)
        return None

    def _reconcile_active_locked(self) -> None:
        """Clear active slot when the worker died or the run is orphaned."""
        if not self._active_id:
            return
        run = self._runs.get(self._active_id)
        if not run:
            self._active_id = None
            return
        if run.status not in ("pending", "running"):
            self._active_id = None
            return
        if run._thread is not None and not run._thread.is_alive():
            thread_dead = True
        elif run.status == "running" and run._thread is None:
            thread_dead = True
        elif (
            run.status == "pending"
            and run._thread is None
            and time.time() - run.created_at > 60
        ):
            thread_dead = True
        else:
            thread_dead = False
        stale = time.time() - run.updated_at > _STALE_RUN_S
        if thread_dead or stale:
            run.status = "error"
            run.error = (
                "Run stopped (orchestrator restarted or UI disconnected). "
                "Start a new run or use Cancel."
            )
            run.append_event({"type": "error", "text": run.error})
            run.append_event({"type": "done"})
            self._active_id = None

    def reconcile_active(self) -> None:
        with self._lock:
            self._reconcile_active_locked()

    def abort_active(self) -> bool:
        """Cancel the active run and release the slot so a new run can start."""
        with self._lock:
            if not self._active_id:
                return False
            run = self._runs.get(self._active_id)
            if not run:
                self._active_id = None
                return False
            run_id = self._active_id
        run.request_cancel()
        with self._lock:
            if self._active_id != run_id:
                return True
            run = self._runs.get(run_id)
            if not run:
                self._active_id = None
                return True
            thread_gone = run._thread is None or not run._thread.is_alive()
            if thread_gone or run.status not in ("pending", "running"):
                self._reconcile_active_locked()
                return True
            # Worker still running; release slot so UI is not stuck on 409. The
            # daemon thread may finish in the background.
            run.status = "cancelled"
            run.ok = False
            run.error = "Cancelled"
            run.append_event({"type": "error", "text": "Cancelled by user"})
            run.append_event({"type": "run_finished", "ok": False})
            run.append_event({"type": "done"})
            self._active_id = None
        return True

    def cancel_active(self) -> bool:
        return self.abort_active()

    def start(
        self,
        *,
        skip_llm: bool = False,
        skip_gpu: bool = False,
        skip_time: bool = False,
        save_transcript: bool = False,
        transcript_path: str | None = None,
    ) -> TestSuiteRun:
        with self._lock:
            self._reconcile_active_locked()
            active = self._runs.get(self._active_id) if self._active_id else None
            if active and active.status in ("pending", "running"):
                raise RuntimeError("A test suite run is already in progress")
            self._prune()
            run_id = uuid.uuid4().hex
            run = TestSuiteRun(run_id=run_id)
            if save_transcript:
                run.transcript_path = str(
                    resolve_transcript_path(run_id=run_id, override=transcript_path)
                )
            self._runs[run_id] = run
            self._active_id = run_id

        def worker() -> None:
            run.status = "running"
            run.updated_at = time.time()
            writer: TranscriptWriter | None = None
            if run.transcript_path:
                writer = TranscriptWriter(Path(run.transcript_path))

            def on_event(event: dict[str, Any]) -> None:
                if writer:
                    writer.write_event(event)
                run.append_event(event)
                if event.get("type") == "run_finished":
                    run.ok = bool(event.get("ok"))
                    run.status = "completed" if run.ok else "error"

            try:
                ok = run_suite(
                    skip_llm=skip_llm,
                    skip_gpu=skip_gpu,
                    skip_time=skip_time,
                    on_event=on_event,
                    cancel_check=run.cancelled,
                )
                if run.cancelled():
                    run.status = "cancelled"
                    run.ok = False
                elif run.status == "running":
                    run.status = "completed" if ok else "error"
                    run.ok = ok
            except Exception as err:
                run.status = "error"
                run.error = str(err)
                run.append_event({"type": "error", "text": str(err)})
            finally:
                if writer:
                    writer.close()
                    run.append_event(
                        {
                            "type": "transcript_saved",
                            "path": run.transcript_path,
                        }
                    )
                run.updated_at = time.time()
                with self._lock:
                    if self._active_id == run_id:
                        self._active_id = None
                run.append_event({"type": "done"})

        run._thread = threading.Thread(target=worker, name=f"test-suite-{run_id[:8]}", daemon=True)
        run._thread.start()
        return run

    def get(self, run_id: str) -> TestSuiteRun | None:
        with self._lock:
            return self._runs.get(run_id)

    def cancel(self, run_id: str) -> bool:
        run = self.get(run_id)
        if not run:
            return False
        run.request_cancel()
        return True


job_store = TestSuiteJobStore()


def sse_pack(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
