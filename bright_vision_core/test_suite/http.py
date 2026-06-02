"""Slim FastAPI app for Test Lab — test-suite routes only (port via BV_TEST_ORCHESTRATOR_PORT)."""

from __future__ import annotations

import os
import shutil
import socket
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from bright_vision_core.test_suite.jobs import job_store, sse_pack
from bright_vision_core.test_suite.log_digest import agent_digest_file, resolve_transcript_for_digest
from bright_vision_core.test_suite.cloud_preflight import (
    cloud_llm_configured,
    cloud_llm_env_file_present,
)
from bright_vision_core.test_suite.router_preflight import (
    resolve_router_tags,
    router_lane_ready,
)
from bright_vision_core.brightdate import brightdate_enabled
from bright_vision_core.test_suite.manifest import SuiteRunOptions, plan_steps
from bright_vision_core.test_suite.ports import orchestrator_port
from bright_vision_core.test_suite.timing import expectations_for_steps, repo_root

app = FastAPI(title="BrightVision Test Suite", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartRunRequest(BaseModel):
    skip_llm: bool = False
    skip_gpu: bool = False
    skip_time: bool = False
    use_brightdate: bool = False
    spec_gen_phased: bool = False
    llm_router: bool = False
    cloud_llm: bool = False
    verify_ears: bool = False
    shipped_scenarios: bool = False
    strict_phased_pytest: bool = False
    save_transcript: bool = False
    transcript_path: str | None = None
    fail_fast: bool = False


def _run_options_from_query(
    skip_llm: bool = False,
    spec_gen_phased: bool = False,
    llm_router: bool = False,
    cloud_llm: bool = False,
    verify_ears: bool = False,
    shipped_scenarios: bool = False,
    strict_phased_pytest: bool = False,
) -> SuiteRunOptions:
    return SuiteRunOptions(
        skip_llm=skip_llm,
        spec_gen_phased=spec_gen_phased,
        llm_router=llm_router,
        cloud_llm=cloud_llm,
        verify_ears=verify_ears,
        shipped_scenarios=shipped_scenarios,
        strict_phased_pytest=strict_phased_pytest,
    )


def _run_options_from_body(body: StartRunRequest) -> SuiteRunOptions:
    return SuiteRunOptions(
        skip_llm=body.skip_llm,
        spec_gen_phased=body.spec_gen_phased,
        llm_router=body.llm_router,
        cloud_llm=body.cloud_llm,
        verify_ears=body.verify_ears,
        shipped_scenarios=body.shipped_scenarios,
        strict_phased_pytest=body.strict_phased_pytest,
    )


class StartRunResponse(BaseModel):
    run_id: str
    transcript_path: str | None = None


class RunStatusResponse(BaseModel):
    run_id: str
    status: str
    ok: bool = False
    error: str | None = None
    transcript_path: str | None = None
    event_count: int = 0
    events: list[dict[str, Any]] = Field(default_factory=list)


@app.get("/health")
def health() -> dict[str, str | bool | int]:
    return {
        "status": "ok",
        "service": "test-suite",
        "runsEnabled": True,
        "cancelActiveRoute": True,
        "port": orchestrator_port(),
    }


@app.get("/test-suite/plan")
def get_plan(
    skip_llm: bool = False,
    spec_gen_phased: bool = False,
    llm_router: bool = False,
    cloud_llm: bool = False,
    verify_ears: bool = False,
    shipped_scenarios: bool = False,
    strict_phased_pytest: bool = False,
) -> dict[str, Any]:
    opts = _run_options_from_query(
        skip_llm=skip_llm,
        spec_gen_phased=spec_gen_phased,
        llm_router=llm_router,
        cloud_llm=cloud_llm,
        verify_ears=verify_ears,
        shipped_scenarios=shipped_scenarios,
        strict_phased_pytest=strict_phased_pytest,
    )
    steps = plan_steps(skip_llm=skip_llm, options=opts)
    return {
        "repoRoot": str(repo_root()),
        "steps": [
            {
                "id": s.id,
                "label": s.label,
                "requiresOllama": s.requires_ollama,
                "requiresCloudConfig": s.requires_cloud_config,
                "touchesCorePort": s.touches_core_port,
            }
            for s in steps
        ],
    }


@app.get("/test-suite/digest")
def get_transcript_digest(
    path: str,
    max_chars: int = 120_000,
    collapse_heartbeats: bool = True,
) -> dict[str, Any]:
    """Agent-sized transcript (heartbeats collapsed). Path must be under test-suite-runs."""
    try:
        resolved = resolve_transcript_for_digest(path)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="Transcript not found")
    try:
        digest = agent_digest_file(
            resolved,
            max_chars=max_chars,
            collapse_heartbeats=collapse_heartbeats,
        )
    except OSError as err:
        raise HTTPException(status_code=500, detail=str(err)) from err
    return {
        "path": str(resolved),
        "chars": len(digest),
        "collapseHeartbeats": collapse_heartbeats,
        "digest": digest,
    }


@app.get("/test-suite/expectations")
def get_expectations(
    skip_llm: bool = False,
    spec_gen_phased: bool = False,
    llm_router: bool = False,
    cloud_llm: bool = False,
    verify_ears: bool = False,
    shipped_scenarios: bool = False,
    strict_phased_pytest: bool = False,
) -> dict[str, Any]:
    opts = _run_options_from_query(
        skip_llm=skip_llm,
        spec_gen_phased=spec_gen_phased,
        llm_router=llm_router,
        cloud_llm=cloud_llm,
        verify_ears=verify_ears,
        shipped_scenarios=shipped_scenarios,
        strict_phased_pytest=strict_phased_pytest,
    )
    step_ids = [s.id for s in plan_steps(skip_llm=skip_llm, options=opts)]
    return expectations_for_steps(step_ids)


def _port_in_use(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.3):
            return True
    except OSError:
        return False


@app.get("/test-suite/preflight")
def preflight() -> dict[str, Any]:
    job_store.reconcile_active()
    core_port = int(os.environ.get("BV_CORE_PORT", "8741"))
    active = job_store.active_run()
    router_ready, router_detail = router_lane_ready()
    fast_tag, heavy_tag = resolve_router_tags()
    return {
        "repoRoot": str(repo_root()),
        "corePortInUse": _port_in_use(core_port),
        "corePort": core_port,
        "orchestratorActive": True,
        "orchestratorPort": orchestrator_port(),
        "specGenPhasedEnv": os.environ.get("E2E_SPEC_GEN_PHASED") == "1",
        "cloudLlmConfigured": cloud_llm_configured(),
        "cloudLlmEnvFilePresent": cloud_llm_env_file_present(),
        "routerLaneReady": router_ready,
        "routerLaneDetail": router_detail,
        "routerFastModel": fast_tag or None,
        "routerHeavyModel": heavy_tag or None,
        "activeRunInProgress": bool(
            active and active.status in ("pending", "running")
        ),
        "activeRunId": active.run_id if active else None,
        "btimeOnPath": bool(shutil.which("btime")),
        "brightDateDefaultEnv": brightdate_enabled(),
    }


@app.post("/test-suite/runs", response_model=StartRunResponse)
def start_run(body: StartRunRequest) -> StartRunResponse:
    job_store.reconcile_active()
    try:
        run = job_store.start(
            skip_llm=body.skip_llm,
            skip_gpu=body.skip_gpu,
            skip_time=body.skip_time,
            use_brightdate=body.use_brightdate,
            run_options=_run_options_from_body(body),
            save_transcript=body.save_transcript,
            transcript_path=body.transcript_path,
            fail_fast=body.fail_fast,
        )
    except RuntimeError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    return StartRunResponse(run_id=run.run_id, transcript_path=run.transcript_path)


@app.get("/test-suite/runs/{run_id}", response_model=RunStatusResponse)
def get_run(run_id: str) -> RunStatusResponse:
    run = job_store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Unknown run")
    return RunStatusResponse(
        run_id=run.run_id,
        status=run.status,
        ok=run.ok,
        error=run.error,
        transcript_path=run.transcript_path,
        event_count=len(run.events),
        events=run.events,
    )


@app.post("/test-suite/runs/active/cancel")
def cancel_active_run() -> dict[str, bool]:
    """Must be registered before /runs/{run_id}/cancel (otherwise run_id captures 'active')."""
    job_store.reconcile_active()
    if not job_store.abort_active():
        raise HTTPException(status_code=404, detail="No active run")
    return {"ok": True}


@app.post("/test-suite/runs/{run_id}/cancel")
def cancel_run(run_id: str) -> dict[str, bool]:
    if run_id == "active":
        raise HTTPException(
            status_code=400,
            detail="Use POST /test-suite/runs/active/cancel for the active run",
        )
    if not job_store.cancel(run_id):
        raise HTTPException(status_code=404, detail="Unknown run")
    return {"ok": True}


@app.get("/test-suite/runs/{run_id}/events")
def stream_run_events(run_id: str):
    run = job_store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Unknown run")

    def generate():
        index = 0
        while True:
            batch = run.wait_events(index, timeout=60.0)
            if not batch:
                if run.status not in ("pending", "running"):
                    break
                continue
            for event in batch:
                index += 1
                yield sse_pack(event)
                if event.get("type") == "done":
                    return
            if run.status not in ("pending", "running"):
                if index >= len(run.events):
                    yield sse_pack({"type": "done"})
                break

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
