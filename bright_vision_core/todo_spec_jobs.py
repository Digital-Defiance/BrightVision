"""
Background jobs for AI todo spec generation (v5).

Uses a short-lived headless session so the user's chat session stays free.
"""

from __future__ import annotations

import concurrent.futures
import threading
import time
import uuid
from typing import Any

from cecli.spec.jobs import (
    JobStatus,
    SpecGenerationJob,
    _JOB_TTL_S,
    _MAX_JOBS,
    spec_gen_section_wait_s,
    spec_gen_turn_timeout_s as _spec_gen_turn_timeout_s,
)

from bright_vision_core.session import Session

__all__ = [
    "JobStatus",
    "SpecGenerationJob",
    "SpecJobStore",
    "job_turn_timeout_s",
    "job_wall_timeout_s",
    "spec_gen_section_wait_s",
    "spec_gen_timeout_s",
    "spec_gen_turn_timeout_s",
    "spec_job_store",
]


def spec_gen_timeout_s() -> float:
    from cecli.spec.jobs import spec_gen_timeout_s as _fn

    return _fn()


def job_wall_timeout_s(job: SpecGenerationJob) -> float:
    if job.wall_timeout_s is not None and job.wall_timeout_s > 0:
        return float(job.wall_timeout_s)
    return spec_gen_timeout_s()


def job_turn_timeout_s(job: SpecGenerationJob) -> float:
    if job.turn_timeout_s is not None and job.turn_timeout_s > 0:
        return float(job.turn_timeout_s)
    return spec_gen_turn_timeout_s()


def spec_gen_turn_timeout_s() -> float:
    return _spec_gen_turn_timeout_s()


class SpecJobStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, SpecGenerationJob] = {}
        self._live_sessions: dict[str, Session] = {}

    def _snapshot_job_session(self, job_id: str, session: Session | None) -> None:
        if session is None:
            return
        from bright_vision_core.spec_job_debug import snapshot_session_into_job

        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
        snapshot_session_into_job(job, session)
        with self._lock:
            j = self._jobs.get(job_id)
            if j:
                j.updated_at = time.time()

    def snapshot_job_if_live(self, job_id: str) -> None:
        """Refresh debug fields from the in-flight headless session when still running."""
        with self._lock:
            session = self._live_sessions.get(job_id)
        self._snapshot_job_session(job_id, session)

    def _prune(self) -> None:
        now = time.time()
        stale = [jid for jid, j in self._jobs.items() if now - j.updated_at > _JOB_TTL_S]
        for jid in stale:
            del self._jobs[jid]
        while len(self._jobs) > _MAX_JOBS:
            oldest = min(self._jobs.values(), key=lambda j: j.updated_at)
            del self._jobs[oldest.job_id]

    def _touch_job(self, job_id: str) -> None:
        """Refresh updated_at while a worker is still running (poll / heartbeat)."""
        with self._lock:
            j = self._jobs.get(job_id)
            if j and j.status == "running":
                j.updated_at = time.time()

    def _reconcile_stale_running(self, job: SpecGenerationJob) -> None:
        """Mark jobs stuck in running past the wall clock (caller must hold ``self._lock``)."""
        if job.status != "running" or job.job_id in self._live_sessions:
            return
        wall_s = job_wall_timeout_s(job)
        if time.time() - job.updated_at <= wall_s + 30.0:
            return
        job.status = "error"
        job.error = f"Spec generation job timed out after {int(wall_s)}s"
        job.updated_at = time.time()

    def _complete_job(self, job_id: str, result: dict[str, Any]) -> None:
        with self._lock:
            j = self._jobs.get(job_id)
            if not j or j.status != "running":
                return
            j.status = "completed"
            j.requirements = result.get("requirements", "")
            j.design = result.get("design", "")
            j.tasks_md = result.get("tasks_md", "")
            j.raw = result.get("raw", "")
            j.item = result.get("item")
            j.ears_blocked = bool(result.get("ears_blocked"))
            j.ears_issues = list(result.get("ears_issues") or [])
            j.updated_at = time.time()

    def start(
        self,
        workspace: str,
        todo_id: str,
        prompt: str,
        *,
        mode: str = "generate",
        section: str = "all",
        apply: bool = True,
        enforce_ears: bool = True,
        context_paths: list[str] | None = None,
        model: str | None = None,
        wall_timeout_s: float | None = None,
        turn_timeout_s: float | None = None,
    ) -> SpecGenerationJob:
        job_id = uuid.uuid4().hex
        if wall_timeout_s is not None and wall_timeout_s > 0:
            resolved_wall = max(1.0, float(wall_timeout_s))
        else:
            resolved_wall = max(60.0, spec_gen_timeout_s())
        if turn_timeout_s is not None and turn_timeout_s > 0:
            resolved_turn = max(1.0, float(turn_timeout_s))
        else:
            resolved_turn = max(60.0, spec_gen_turn_timeout_s())
        if resolved_wall > 30.0:
            resolved_turn = min(resolved_turn, resolved_wall - 30.0)
        job = SpecGenerationJob(
            job_id=job_id,
            workspace=workspace,
            todo_id=todo_id,
            prompt=prompt,
            mode=mode,
            section=section,
            model=model,
            wall_timeout_s=resolved_wall,
            turn_timeout_s=resolved_turn,
        )
        with self._lock:
            self._prune()
            self._jobs[job_id] = job

        def _run() -> dict[str, Any]:
            session = Session.create(
                workspace,
                model=model,
                yes=True,
                dry_run=True,
                auto_commits=False,
                echo_to_console=False,
                chat_history_file=False,
                spec_focus=True,
            )
            with self._lock:
                self._live_sessions[job_id] = session
            try:
                return session.generate_todo_layers(
                    todo_id,
                    prompt,
                    mode=mode,
                    section=section,
                    apply=apply,
                    enforce_ears=enforce_ears,
                    context_paths=context_paths,
                    turn_timeout_s=job_turn_timeout_s(job),
                )
            finally:
                self._snapshot_job_session(job_id, session)
                with self._lock:
                    self._live_sessions.pop(job_id, None)

        def worker() -> None:
            self._set_status(job_id, "running")
            wall_s = job_wall_timeout_s(job)
            stop_heartbeat = threading.Event()

            def _heartbeat() -> None:
                while not stop_heartbeat.wait(30.0):
                    self._touch_job(job_id)

            heartbeat = threading.Thread(
                target=_heartbeat,
                daemon=True,
                name=f"spec-job-hb-{job_id[:8]}",
            )
            heartbeat.start()
            pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            fut = pool.submit(_run)
            try:
                result = fut.result(timeout=wall_s)
                self._complete_job(job_id, result)
            except concurrent.futures.TimeoutError:
                with self._lock:
                    sess = self._live_sessions.get(job_id)
                if sess is not None:
                    try:
                        sess.interrupt_turn()
                    except Exception:
                        pass
                self._set_error(
                    job_id,
                    f"Spec generation job timed out after {int(wall_s)}s",
                )
            except Exception as err:
                self._set_error(job_id, str(err))
            finally:
                stop_heartbeat.set()
                pool.shutdown(wait=False, cancel_futures=True)

        threading.Thread(target=worker, daemon=True, name=f"spec-job-{job_id[:8]}").start()
        return job

    def _set_status(self, job_id: str, status: JobStatus) -> None:
        with self._lock:
            j = self._jobs.get(job_id)
            if j:
                j.status = status
                j.updated_at = time.time()

    def _set_error(self, job_id: str, message: str) -> None:
        with self._lock:
            j = self._jobs.get(job_id)
            if j and j.status == "running":
                j.status = "error"
                j.error = message
                j.updated_at = time.time()

    def get(self, job_id: str) -> SpecGenerationJob | None:
        with self._lock:
            j = self._jobs.get(job_id)
            if j:
                self._reconcile_stale_running(j)
            return j

    def wait(self, job_id: str, *, timeout_s: float | None = None) -> SpecGenerationJob:
        job = self.get(job_id)
        if not job:
            raise KeyError(f"Unknown job: {job_id}")
        if timeout_s is None:
            timeout_s = job_wall_timeout_s(job) + 30.0
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            job = self.get(job_id)
            if not job:
                raise KeyError(f"Unknown job: {job_id}")
            if job.status in ("completed", "error"):
                return job
            time.sleep(0.25)
        raise TimeoutError(f"Spec generation job timed out: {job_id}")


spec_job_store = SpecJobStore()
