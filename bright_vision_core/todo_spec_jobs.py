"""
Background jobs for AI todo spec generation (v5).

Uses a short-lived headless session so the user's chat session stays free.
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from bright_vision_core.session import Session

JobStatus = Literal["pending", "running", "completed", "error"]

_MAX_JOBS = 64
_JOB_TTL_S = 3600
# Kiro-grade specs are longer to generate; give local models headroom so a single
# rich section (intro + user stories + acceptance criteria) does not hit the turn cap.
_DEFAULT_WAIT_S = 1200.0


def spec_gen_timeout_s() -> float:
    """Wall-clock cap for background generate-spec jobs (pytest + HTTP sync wait)."""
    raw = os.environ.get("LLM_SPEC_GEN_TIMEOUT_S", str(int(_DEFAULT_WAIT_S)))
    try:
        return max(60.0, float(raw))
    except ValueError:
        return _DEFAULT_WAIT_S


def spec_gen_turn_timeout_s() -> float:
    """Wall-clock cap for one LLM one-shot inside generate-spec (run_one_shot)."""
    if os.environ.get("LLM_SPEC_GEN_TURN_TIMEOUT_S"):
        try:
            return max(60.0, float(os.environ["LLM_SPEC_GEN_TURN_TIMEOUT_S"]))
        except ValueError:
            pass
    job_cap = spec_gen_timeout_s()
    if os.environ.get("LLM_TEST_TURN_TIMEOUT_S"):
        try:
            chat_cap = float(os.environ["LLM_TEST_TURN_TIMEOUT_S"])
        except ValueError:
            chat_cap = 300.0
    else:
        chat_cap = 300.0
    # Phased requirements/design/tasks prompts are larger than a chat turn (Kiro
    # structure + few-shot exemplar) and produce longer output; scale with job cap.
    scaled = min(job_cap - 60.0, max(chat_cap, job_cap * 0.6))
    return max(60.0, scaled)


def spec_gen_section_wait_s() -> float:
    """Poll cap for one phased section — slightly above one-shot turn cap."""
    return min(spec_gen_timeout_s(), spec_gen_turn_timeout_s() + 120.0)


@dataclass
class SpecGenerationJob:
    job_id: str
    workspace: str
    todo_id: str
    status: JobStatus = "pending"
    error: str | None = None
    requirements: str = ""
    design: str = ""
    tasks_md: str = ""
    raw: str = ""
    item: Any = None
    ears_blocked: bool = False
    ears_issues: list[dict] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


class SpecJobStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, SpecGenerationJob] = {}

    def _prune(self) -> None:
        now = time.time()
        stale = [jid for jid, j in self._jobs.items() if now - j.updated_at > _JOB_TTL_S]
        for jid in stale:
            del self._jobs[jid]
        while len(self._jobs) > _MAX_JOBS:
            oldest = min(self._jobs.values(), key=lambda j: j.updated_at)
            del self._jobs[oldest.job_id]

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
    ) -> SpecGenerationJob:
        job_id = uuid.uuid4().hex
        job = SpecGenerationJob(job_id=job_id, workspace=workspace, todo_id=todo_id)
        with self._lock:
            self._prune()
            self._jobs[job_id] = job

        def worker() -> None:
            self._set_status(job_id, "running")
            try:
                session = Session.create(
                    workspace,
                    model=model,
                    yes=True,
                    dry_run=True,
                    auto_commits=False,
                    echo_to_console=False,
                    chat_history_file=False,
                    map_tokens=0,
                )
                result = session.generate_todo_layers(
                    todo_id,
                    prompt,
                    mode=mode,
                    section=section,
                    apply=apply,
                    enforce_ears=enforce_ears,
                    context_paths=context_paths,
                )
                with self._lock:
                    j = self._jobs.get(job_id)
                    if not j:
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
            except Exception as err:
                self._set_error(job_id, str(err))

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
            if j:
                j.status = "error"
                j.error = message
                j.updated_at = time.time()

    def get(self, job_id: str) -> SpecGenerationJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def wait(self, job_id: str, *, timeout_s: float | None = None) -> SpecGenerationJob:
        timeout_s = spec_gen_timeout_s() if timeout_s is None else timeout_s
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
