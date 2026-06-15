"""
HTTP API for BrightVision (FastAPI + Server-Sent Events).

Run with::

    python scripts/vision_serve.py --workspace /path/to/repo

Or::

    uvicorn bright_vision_core.http_api:app --host 127.0.0.1 --port 8741
"""

from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from bright_vision_core.vision_runtime import configure_vision_runtime

# LiteLLM (via configure_vision_runtime) must not load before cecli — see litellm_ollama_patch.
import cecli as _cecli_bootstrap  # noqa: F401

configure_vision_runtime()

import os as _os

if _os.environ.get("BV_TEST_SUITE_ACTIVE") == "1" or _os.environ.get("E2E_LLM") == "1":
    import webbrowser as _webbrowser

    _webbrowser.open = lambda *_a, **_k: None  # type: ignore[method-assign, assignment]
    try:
        import cecli.io as _cecli_io

        _cecli_io.webbrowser.open = lambda *_a, **_k: None  # type: ignore[attr-defined]
    except ImportError:
        pass

from bright_vision_core.git_undo import undo_last_aider_commit_for_coder
from bright_vision_core.agent_todos import (
    sync_session_agent_todos,
    try_import_agent_plan_for_workspace,
)
from bright_vision_core.http_auth import auth_enabled, configure_auth, get_token_from_env, verify_bearer
from bright_vision_core.session import Session
from bright_vision_core.session_debug import build_session_debug_export
from bright_vision_core.spec_job_debug import build_spec_job_debug_export
from bright_vision_core.session_transcript import transcript_rows_from_coder
from bright_vision_core.todo_spec_jobs import spec_gen_timeout_s, spec_job_store
from bright_vision_core.workspace_files import filter_existing_workspace_paths
from bright_vision_core.workspace_todos import (
    SPEC_LAYER_TEMPLATES,
    TODO_TEMPLATES,
    ChecklistItem,
    TodoItem,
    TodoStore,
    WorkspaceTodos,
)


@asynccontextmanager
async def _app_lifespan(app: FastAPI):
    # When started via raw uvicorn, still honor BRIGHT_VISION_TOKEN if set.
    if get_token_from_env():
        configure_auth("127.0.0.1")
    yield


class BearerAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)
        if not verify_bearer(request.headers.get("authorization")):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
        return await call_next(request)

app = FastAPI(
    title="BrightVision Vision API",
    description="Headless Cecli sessions for BrightVision web and desktop clients",
    version="0.1.0",
    lifespan=_app_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(BearerAuthMiddleware)

_lock = threading.Lock()
_sessions: dict[str, Session] = {}


class ModelPoolEntryModel(BaseModel):
    model: str = ""
    tier: str = Field(description="fast | code | think (heavy → code)")
    enabled: bool = True
    label: str = ""


class ModelRouterRequest(BaseModel):
    enabled: bool = False
    fast_model: str = Field(default="", description="Resolved fast tier (from hopper)")
    heavy_model: str | None = Field(
        default=None,
        description="Resolved code tier (legacy name; same as code_model)",
    )
    code_model: str | None = Field(
        default=None,
        description="Resolved code tier; defaults to session model",
    )
    think_model: str | None = Field(
        default=None,
        description="Resolved think/reasoning tier (optional)",
    )
    model_pool: list[ModelPoolEntryModel] = Field(
        default_factory=list,
        description="Settings hopper: enabled models + tier",
    )
    token_fast_max: int = 4_096
    token_heavy_min: int = 12_000
    keep_alive_fast: int | str = 300
    keep_alive_heavy: int | str = -1
    escalate_on_failure: bool = True

    @field_validator("keep_alive_heavy", mode="before")
    @classmethod
    def _normalize_heavy_keep_alive(cls, value: int | str | None) -> int | str:
        from bright_vision_core.model_router import normalize_keep_alive_for_tier

        return normalize_keep_alive_for_tier("heavy", -1 if value is None else value)


class CreateSessionRequest(BaseModel):
    workspace: str = Field(..., description="Absolute path to git workspace root")
    files: list[str] = Field(default_factory=list, description="Files to add to the chat")
    model: str | None = Field(default=None, description="LLM model name")
    model_router: ModelRouterRequest | None = Field(
        default=None,
        description="Optional local model tiering (fast vs heavy Ollama)",
    )
    stream: bool = True
    auto_yes: bool = Field(
        False,
        description="Auto-approve confirmations (non-interactive; use UI confirm API when false)",
    )
    auto_commits: bool = True
    dirty_commits: bool = True
    dry_run: bool = False
    session_encrypt: bool = Field(
        False,
        description="Encrypt saved sessions (requires CECLI_SESSION_KEY from OS keychain on desktop)",
    )
    session_key_file: str | None = Field(
        default=None,
        description="Optional path to a session encryption key file",
    )
    auto_save: bool = Field(
        False,
        description="Auto-save session JSON to .cecli/sessions/ (cecli --auto-save)",
    )
    auto_load: bool = Field(
        False,
        description="Load auto-save session on session create (cecli --auto-load)",
    )
    auto_save_session_name: str = Field(
        "brightvision",
        description="Basename for auto-save/load under .cecli/sessions/",
    )
    chat_history_file: bool = Field(
        True,
        description="Append turns to .cecli/chat.history (cecli chat history file)",
    )
    spec_focus: bool = Field(
        False,
        description="Session defaults to spec-focus chat (steering + task spec inject)",
    )
    session_mode: str = Field(
        "vibe",
        description="vibe = implementation chat; spec = Kiro-style spec session (steering + inject)",
    )
    workspace_name: str | None = Field(
        default=None,
        description="Cecli clone workspace name (~/.cecli/workspaces/) when using repo: projects",
    )
    workspaces: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Optional workspace config (name + projects with path: or repo:). "
            "Written to .cecli.workspaces.yml in the project when absent."
        ),
    )


class ConfirmRequest(BaseModel):
    confirm_id: str = Field(..., min_length=1)
    answer: bool = Field(..., description="True to accept, False to decline")


class MessageRequest(BaseModel):
    content: str = Field(..., min_length=1)
    preproc: bool = True
    active_todo_id: str | None = Field(
        None,
        description="Workspace task id for this turn (links + optional spec inject)",
    )
    inject_todo_spec: bool = Field(
        False,
        description="When true with active_todo_id, prepend task spec to the message",
    )
    spec_focus: bool = Field(
        False,
        description="Spec-focus turn: steering + always inject active task spec (#20)",
    )
    force_tier: str | None = Field(
        default=None,
        description="Override router: fast | code | think (heavy → code)",
    )
    escalate_from_last: bool = Field(
        default=False,
        description="Escalate to next tier (fast→code→think) after a stalled attempt",
    )


class ChecklistItemModel(BaseModel):
    id: str
    text: str
    done: bool = False


class TodoItemModel(BaseModel):
    id: str
    title: str
    spec: str = ""
    requirements: str = ""
    design: str = ""
    tasks_md: str = ""
    depends_on: list[str] = Field(default_factory=list)
    branch: str = ""
    pr_url: str = ""
    status: str = "open"
    links: list[str] = Field(default_factory=list)
    checklist: list[ChecklistItemModel] = Field(default_factory=list)
    created_at: str
    updated_at: str


class TodoListResponse(BaseModel):
    version: int = 1
    active_id: str | None = Field(None, serialization_alias="activeId")
    todos: list[TodoItemModel]
    templates: list[str] = Field(
        default_factory=lambda: sorted(set(TODO_TEMPLATES) | set(SPEC_LAYER_TEMPLATES))
    )

    model_config = {"populate_by_name": True}


class CreateTodoRequest(BaseModel):
    title: str = Field(..., min_length=1)
    spec: str = ""
    template: str | None = None


class PatchTodoRequest(BaseModel):
    title: str | None = None
    spec: str | None = None
    requirements: str | None = None
    design: str | None = None
    tasks_md: str | None = None
    depends_on: list[str] | None = None
    branch: str | None = None
    pr_url: str | None = None
    status: str | None = None
    links: list[str] | None = None
    checklist: list[ChecklistItemModel] | None = None


class SetActiveTodoRequest(BaseModel):
    active_id: str | None = Field(
        None,
        validation_alias="activeId",
        serialization_alias="activeId",
    )

    model_config = {"populate_by_name": True}


class MoveTodoRequest(BaseModel):
    direction: str = Field(..., description="up | down")


class PatchTodoResponse(BaseModel):
    item: TodoItemModel
    auto_completed: bool = False
    ears_requirements_ok: bool | None = None
    ears_error_count: int | None = None


class ImportTodosRequest(BaseModel):
    workspace: str = Field(..., min_length=1)
    markdown: str = Field(..., min_length=1)
    merge: bool = False


class LintRequirementsRequest(BaseModel):
    """Optional draft text; when omitted, lints the task's stored ``requirements`` field."""

    requirements: str | None = None


class EarsIssueModel(BaseModel):
    code: str
    message: str
    severity: str
    line: int | None = None
    req_id: str | None = None
    todo_id: str | None = None


class EarsClauseModel(BaseModel):
    req_id: str | None = None
    line: int
    text: str
    pattern: str


class EarsLintResponse(BaseModel):
    ok: bool
    error_count: int
    warning_count: int
    source_path: str | None = None
    issues: list[EarsIssueModel] = Field(default_factory=list)
    clauses: list[EarsClauseModel] = Field(default_factory=list)


class SpecFolderRecordModel(BaseModel):
    todo_id: str
    has_requirements: bool = False
    has_design: bool = False
    has_tasks: bool = False
    req_ids: list[str] = Field(default_factory=list)
    requirements_ok: bool | None = None
    requirements_errors: int = 0


class SpecIndexResponse(BaseModel):
    ok: bool
    error_count: int
    warning_count: int
    task_ids: list[str] = Field(default_factory=list)
    folders: list[SpecFolderRecordModel] = Field(default_factory=list)
    issues: list[EarsIssueModel] = Field(default_factory=list)


class SteeringFileModel(BaseModel):
    relpath: str
    size_bytes: int
    nonempty: bool


class SteeringFilesResponse(BaseModel):
    has_content: bool
    file_count: int
    main: SteeringFileModel | None = None
    fragments: list[SteeringFileModel] = Field(default_factory=list)


class SteeringScaffoldResponse(SteeringFilesResponse):
    created: list[str] = Field(default_factory=list)


class TraceSpecRequest(BaseModel):
    """Optional draft layers; omitted fields use the task's stored markdown."""

    requirements: str | None = None
    design: str | None = None
    tasks_md: str | None = None


class TraceLinkModel(BaseModel):
    req_id: str
    in_design: bool = False
    task_steps: list[int] = Field(default_factory=list)


class TraceStepModel(BaseModel):
    number: int
    text: str
    done: bool
    req_refs: list[str] = Field(default_factory=list)


class TraceabilityResponse(BaseModel):
    ok: bool
    error_count: int
    warning_count: int
    req_ids: list[str] = Field(default_factory=list)
    links: list[TraceLinkModel] = Field(default_factory=list)
    steps: list[TraceStepModel] = Field(default_factory=list)
    design_headings: list[str] = Field(default_factory=list)
    issues: list[EarsIssueModel] = Field(default_factory=list)


class ImplementationStepModel(BaseModel):
    step_id: str | None = None
    text: str = ""
    done: bool = False
    current: bool = False
    verify_cmd: str | None = None


class ImplementationProgressResponse(BaseModel):
    todo_id: str
    title: str = ""
    steps: list[ImplementationStepModel] = Field(default_factory=list)
    next_open: ImplementationStepModel | None = None


class PubspecRepairResponse(BaseModel):
    missing: list[str] = Field(default_factory=list)
    added: list[str] = Field(default_factory=list)
    applied: bool = False
    message: str = ""


class GenerateTodoSpecRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    mode: str = Field("generate", description="generate | refine")
    section: str = Field(
        "all",
        description="all | requirements | design | tasks_md — phased Kiro-style wizard",
    )
    context_paths: list[str] = Field(
        default_factory=list,
        description="Workspace-relative paths (/add context) included in the ephemeral generate session",
    )
    apply: bool = Field(True, description="Write parsed layers back to the task")
    enforce_ears: bool = Field(
        True,
        description="When apply=true, skip persist if generated requirements fail EARS lint",
    )
    background: bool = Field(
        True,
        description="Use ephemeral session in a background thread (chat session stays free)",
    )
    wall_timeout_s: float | None = Field(
        None,
        ge=60,
        le=7200,
        description="Job wall clock (seconds); default from LLM_SPEC_GEN_TIMEOUT_S",
    )
    turn_timeout_s: float | None = Field(
        None,
        ge=60,
        le=7200,
        description="Per LLM turn inside generate-spec (seconds); default from LLM_SPEC_GEN_TURN_TIMEOUT_S",
    )


class GenerateTodoSpecJobStarted(BaseModel):
    job_id: str
    status: str = "pending"
    todo_id: str


class GenerateTodoSpecJobStatus(BaseModel):
    job_id: str
    status: str
    todo_id: str
    error: str | None = None
    requirements: str = ""
    design: str = ""
    tasks_md: str = ""
    raw: str = ""
    item: TodoItemModel | None = None
    ears_blocked: bool = False
    ears_issues: list[EarsIssueModel] = Field(default_factory=list)


class GenerateTodoSpecResponse(BaseModel):
    job_id: str | None = None
    status: str = "completed"
    requirements: str = ""
    design: str = ""
    tasks_md: str = ""
    raw: str = ""
    item: TodoItemModel | None = None
    ears_blocked: bool = False
    ears_issues: list[EarsIssueModel] = Field(default_factory=list)


class AddFilesRequest(BaseModel):
    paths: list[str] = Field(..., min_length=1, description="Absolute or workspace-relative file paths")


class UploadedFilePart(BaseModel):
    filename: str = Field(..., min_length=1)
    content_base64: str = Field(..., min_length=1)


class UploadFilesRequest(BaseModel):
    files: list[UploadedFilePart] = Field(..., min_length=1)


class AddFilesResponse(BaseModel):
    files_in_chat: list[str]
    events: list[dict[str, Any]] = Field(default_factory=list)


class SessionInfo(BaseModel):
    session_id: str
    workspace: str
    model: str
    files_in_chat: list[str]


class TranscriptRow(BaseModel):
    role: str
    content: str


class TranscriptResponse(BaseModel):
    messages: list[TranscriptRow]


class CommandInfo(BaseModel):
    name: str
    summary: str


class CommandListResponse(BaseModel):
    commands: list[CommandInfo]


class SubAgentInfo(BaseModel):
    name: str
    model: str | None = None
    prompt_preview: str = ""


class SubAgentListResponse(BaseModel):
    subagents: list[SubAgentInfo]
    agent_mode_available: bool = False


def _sse_pack(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _engine_versions() -> dict[str, str]:
    versions: dict[str, str] = {}
    try:
        import bright_vision_core as bvc

        versions["bright_vision_core"] = str(getattr(bvc, "__version__", "unknown"))
    except Exception:
        versions["bright_vision_core"] = "unknown"
    try:
        from cecli._version import version as cecli_version

        versions["cecli"] = str(cecli_version)
    except Exception:
        versions["cecli"] = "unknown"
    return versions


@app.get("/health")
def health():
    import os

    from bright_vision_core.agent_turn import AGENT_TURN_FEATURES

    engine_root = os.environ.get("BRIGHT_VISION_ROOT") or os.environ.get("BV_ROOT")
    return {
        "status": "ok",
        "auth_required": auth_enabled(),
        "versions": _engine_versions(),
        "engine_root": engine_root,
        "agent_turn_features": AGENT_TURN_FEATURES,
    }


def _normalize_session_mode(mode: str) -> str:
    m = (mode or "vibe").strip().lower()
    if m not in ("vibe", "spec"):
        raise HTTPException(status_code=400, detail=f"Invalid session_mode: {mode}")
    return m


@app.post("/sessions", response_model=SessionInfo)
def create_session(body: CreateSessionRequest):
    try:
        mode = _normalize_session_mode(body.session_mode)
        router_payload = (
            body.model_router.model_dump() if body.model_router is not None else None
        )
        session = Session.create(
            body.workspace,
            files=body.files or None,
            model=body.model,
            stream=body.stream,
            yes=body.auto_yes,
            auto_commits=body.auto_commits,
            dirty_commits=body.dirty_commits,
            dry_run=body.dry_run,
            model_router=router_payload,
            session_encrypt=body.session_encrypt,
            session_key_file=body.session_key_file,
            auto_save=body.auto_save,
            auto_load=body.auto_load,
            auto_save_session_name=body.auto_save_session_name,
            chat_history_file=body.chat_history_file,
            spec_focus=body.spec_focus or mode == "spec",
            session_mode=mode,  # type: ignore[arg-type]
            workspaces=body.workspaces,
            workspace_name=body.workspace_name,
        )
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    session_id = uuid.uuid4().hex
    with _lock:
        _sessions[session_id] = session

    return SessionInfo(
        session_id=session_id,
        workspace=body.workspace,
        model=session.coder.main_model.name,
        files_in_chat=session.coder.get_inchat_relative_files(),
    )


@app.get("/sessions/{session_id}", response_model=SessionInfo)
def get_session(session_id: str):
    session = _get_session(session_id)
    return _session_info(session_id, session)


@app.get("/sessions/{session_id}/transcript", response_model=TranscriptResponse)
def get_session_transcript(session_id: str):
    """Cecli conversation rows for hydrating the React chat after auto-load or /load-session."""
    session = _get_session(session_id)
    rows = transcript_rows_from_coder(session.coder)
    return TranscriptResponse(
        messages=[TranscriptRow(role=r["role"], content=r["content"]) for r in rows]
    )


@app.get("/sessions/{session_id}/debug")
def get_session_debug(session_id: str):
    """
    Export a JSON debug bundle: messages, tool calls, duplicate hints, agent todo, recent events.

    Use when reporting malformed tool args, duplicate GitLog/Grep calls, or stuck /agent turns.
    """
    session = _get_session(session_id)
    payload = build_session_debug_export(session_id, session)
    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": (
                f'attachment; filename="brightvision-session-{session_id[:8]}-debug.json"'
            ),
        },
    )


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    with _lock:
        if session_id not in _sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        del _sessions[session_id]
    return {"deleted": session_id}


@app.get("/sessions/{session_id}/commands", response_model=CommandListResponse)
def list_commands(session_id: str):
    session = _get_session(session_id)
    commands = session.coder.commands.get_commands()
    items: list[CommandInfo] = []
    for cmd in sorted(commands):
        key = cmd[1:].replace("-", "_")
        method = getattr(session.coder.commands, f"cmd_{key}", None)
        summary = ""
        if method and method.__doc__:
            summary = method.__doc__.strip().split("\n")[0]
        items.append(CommandInfo(name=cmd, summary=summary))
    return CommandListResponse(commands=items)


def _subagent_paths_for_coder(coder) -> list[str]:
    paths: list[str] = []
    raw_paths = getattr(coder, "sub_agent_paths", None)
    if raw_paths:
        paths.extend(list(raw_paths))
    agent_config = getattr(coder, "agent_config", None)
    if isinstance(agent_config, dict):
        extra = agent_config.get("subagent_paths") or agent_config.get("sub_agent_paths")
        if extra:
            paths.extend(list(extra))
    return paths


@app.get("/sessions/{session_id}/subagents", response_model=SubAgentListResponse)
def list_subagents(session_id: str):
    """List registered sub-agents from cecli AgentService (after scanning subagent_paths)."""
    session = _get_session(session_id)
    from cecli.helpers.agents.service import AgentService

    paths = _subagent_paths_for_coder(session.coder)
    if paths:
        AgentService.build_registry(paths)

    items: list[SubAgentInfo] = []
    for name, cfg in sorted(AgentService.get_registry().items()):
        model = getattr(cfg, "model", None)
        prompt = (getattr(cfg, "prompt", None) or "").strip().replace("\n", " ")
        preview = prompt[:160] + ("…" if len(prompt) > 160 else "")
        items.append(SubAgentInfo(name=str(name), model=model, prompt_preview=preview))

    coder_type = type(session.coder).__name__
    agent_mode_available = "Agent" in coder_type or bool(getattr(session.coder, "agent_config", None))
    return SubAgentListResponse(subagents=items, agent_mode_available=agent_mode_available)


def _workspace_todos(session: Session) -> WorkspaceTodos:
    return WorkspaceTodos(session.coder.root)


def _todos_for_workspace(workspace: str) -> WorkspaceTodos:
    root = Path(workspace).resolve()
    if not root.is_dir():
        raise HTTPException(status_code=404, detail=f"Not a directory: {workspace}")
    return WorkspaceTodos(root)


def _patch_todo_api(api: WorkspaceTodos, todo_id: str, body: PatchTodoRequest) -> PatchTodoResponse:
    checklist = None
    if body.checklist is not None:
        checklist = [
            ChecklistItem(id=c.id or uuid.uuid4().hex[:8], text=c.text, done=c.done)
            for c in body.checklist
        ]
    status = body.status
    if status is not None and status not in ("open", "in_progress", "done", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    try:
        item, auto_completed = api.update(
            todo_id,
            title=body.title,
            spec=body.spec,
            requirements=body.requirements,
            design=body.design,
            tasks_md=body.tasks_md,
            depends_on=body.depends_on,
            branch=body.branch,
            pr_url=body.pr_url,
            status=status,
            links=body.links,
            checklist=checklist,
        )
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    ears_ok: bool | None = None
    ears_errors: int | None = None
    if body.requirements is not None:
        lint = _ears_lint_response(item.requirements)
        ears_ok = lint.ok
        ears_errors = lint.error_count
    return PatchTodoResponse(
        item=_todo_item_model(item),
        auto_completed=auto_completed,
        ears_requirements_ok=ears_ok,
        ears_error_count=ears_errors,
    )


def _ears_lint_response(requirements: str, *, source_path: str | None = None) -> EarsLintResponse:
    from bright_vision_core.ears import analyze_requirements

    result = analyze_requirements(requirements, source_path=source_path)
    return EarsLintResponse.model_validate(result.to_dict())


def _spec_index_response(api: WorkspaceTodos) -> SpecIndexResponse:
    from bright_vision_core.ears import build_spec_index

    store = api.load()
    task_ids = [t.id for t in store.todos]
    result = build_spec_index(api.root, task_ids=task_ids)
    return SpecIndexResponse.model_validate(result.to_dict())


def _steering_files_response(workspace: str) -> SteeringFilesResponse:
    from bright_vision_core.spec_steering import scan_steering_files

    snapshot = scan_steering_files(workspace)
    return SteeringFilesResponse(
        has_content=snapshot.has_content,
        file_count=snapshot.file_count,
        main=(
            SteeringFileModel(
                relpath=snapshot.main.relpath,
                size_bytes=snapshot.main.size_bytes,
                nonempty=snapshot.main.nonempty,
            )
            if snapshot.main
            else None
        ),
        fragments=[
            SteeringFileModel(
                relpath=fragment.relpath,
                size_bytes=fragment.size_bytes,
                nonempty=fragment.nonempty,
            )
            for fragment in snapshot.fragments
        ],
    )


def _trace_todo_spec(
    api: WorkspaceTodos,
    todo_id: str,
    body: TraceSpecRequest | None,
) -> TraceabilityResponse:
    from bright_vision_core.ears import analyze_traceability

    store = api.load()
    item = next((t for t in store.todos if t.id == todo_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Todo not found")
    requirements = item.requirements
    design = item.design
    tasks_md = item.tasks_md
    if body is not None:
        if body.requirements is not None:
            requirements = body.requirements
        if body.design is not None:
            design = body.design
        if body.tasks_md is not None:
            tasks_md = body.tasks_md
    result = analyze_traceability(requirements, design, tasks_md)
    return TraceabilityResponse.model_validate(result.to_dict())


def _implementation_progress_response(api: WorkspaceTodos, todo_id: str) -> ImplementationProgressResponse:
    from bright_vision_core.implement_progress import implementation_progress_payload

    store = api.load()
    item = next((t for t in store.todos if t.id == todo_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Todo not found")
    payload = implementation_progress_payload(item)
    return ImplementationProgressResponse.model_validate(payload)


def _materialize_todo_checklist(api: WorkspaceTodos, todo_id: str) -> TodoItemModel:
    from cecli.spec.progress import materialize_checklist_from_tasks_md

    store = api.load()
    item = next((t for t in store.todos if t.id == todo_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Todo not found")
    checklist = materialize_checklist_from_tasks_md(item)
    if not checklist:
        raise HTTPException(status_code=400, detail="No numbered steps in tasks_md to materialize")
    item, _ = api.update(todo_id, checklist=checklist)
    return _todo_item_model(item)


def _lint_todo_requirements(
    api: WorkspaceTodos,
    todo_id: str,
    body: LintRequirementsRequest | None,
) -> EarsLintResponse:
    store = api.load()
    item = next((t for t in store.todos if t.id == todo_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Todo not found")
    text = item.requirements
    if body is not None and body.requirements is not None:
        text = body.requirements
    return _ears_lint_response(
        text,
        source_path=f".cecli/specs/{todo_id}/requirements.md",
    )


def _todo_item_model(item: TodoItem) -> TodoItemModel:
    return TodoItemModel(
        id=item.id,
        title=item.title,
        spec=item.spec,
        requirements=item.requirements,
        design=item.design,
        tasks_md=item.tasks_md,
        depends_on=item.depends_on,
        branch=item.branch,
        pr_url=item.pr_url,
        status=item.status,
        links=item.links,
        checklist=[ChecklistItemModel(id=c.id, text=c.text, done=c.done) for c in item.checklist],
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _todo_list_response(store: TodoStore) -> TodoListResponse:
    return TodoListResponse(
        version=store.version,
        active_id=store.active_id,
        todos=[_todo_item_model(t) for t in store.todos],
    )


class CecliWorkspaceProjectModel(BaseModel):
    name: str | None = None
    path: str | None = None
    repo: str | None = None
    primary: bool = False
    readonly: bool = False


class CecliWorkspaceResponse(BaseModel):
    present: bool
    filename: str | None = None
    name: str | None = None
    project_count: int = 0
    projects: list[CecliWorkspaceProjectModel] = Field(default_factory=list)
    layout: str | None = None
    parse_error: str | None = None
    raw: str | None = Field(
        default=None,
        description="Full YAML text when present (for Settings editor)",
    )


@app.get("/workspaces/cecli-workspace", response_model=CecliWorkspaceResponse)
def get_cecli_workspace(workspace: str, include_raw: bool = True):
    from bright_vision_core.workspace_config import describe_cecli_workspace

    ws = Path(workspace).expanduser().resolve()
    if not ws.is_dir():
        raise HTTPException(status_code=404, detail=f"Workspace not found: {workspace}")
    info = describe_cecli_workspace(ws)
    if not include_raw:
        info = {**info, "raw": None}
    return CecliWorkspaceResponse(
        present=info["present"],
        filename=info.get("filename"),
        name=info.get("name"),
        project_count=info.get("project_count", 0),
        projects=[CecliWorkspaceProjectModel(**p) for p in info.get("projects", [])],
        layout=info.get("layout"),
        parse_error=info.get("parse_error"),
        raw=info.get("raw"),
    )


@app.get("/workspaces/todos", response_model=TodoListResponse)
def list_workspace_todos(workspace: str):
    return _todo_list_response(_todos_for_workspace(workspace).load())


@app.post("/workspaces/todos", response_model=TodoItemModel)
def create_workspace_todo(workspace: str, body: CreateTodoRequest):
    api = _todos_for_workspace(workspace)
    item = api.add(body.title, body.spec, template=body.template)
    return _todo_item_model(item)


@app.patch("/workspaces/todos/{todo_id}", response_model=PatchTodoResponse)
def patch_workspace_todo(workspace: str, todo_id: str, body: PatchTodoRequest):
    return _patch_todo_api(_todos_for_workspace(workspace), todo_id, body)


@app.delete("/workspaces/todos/{todo_id}")
def delete_workspace_todo(workspace: str, todo_id: str):
    try:
        _todos_for_workspace(workspace).delete(todo_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    return {"deleted": todo_id}


@app.post("/workspaces/todos/{todo_id}/move", response_model=TodoListResponse)
def move_workspace_todo(workspace: str, todo_id: str, body: MoveTodoRequest):
    if body.direction not in ("up", "down"):
        raise HTTPException(status_code=400, detail=f"Invalid direction: {body.direction}")
    try:
        store = _todos_for_workspace(workspace).move(todo_id, body.direction)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    return _todo_list_response(store)


@app.put("/sessions/{session_id}/todos/{todo_id}/move", response_model=TodoListResponse)
def move_session_todo(session_id: str, todo_id: str, body: MoveTodoRequest):
    if body.direction not in ("up", "down"):
        raise HTTPException(status_code=400, detail=f"Invalid direction: {body.direction}")
    session = _get_session(session_id)
    try:
        store = _workspace_todos(session).move(todo_id, body.direction)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    return _todo_list_response(store)


@app.put("/workspaces/todos/active", response_model=TodoListResponse)
def set_workspace_active_todo(workspace: str, body: SetActiveTodoRequest):
    try:
        store = _todos_for_workspace(workspace).set_active(body.active_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    return _todo_list_response(store)


@app.get("/workspaces/todos/export")
def export_workspace_todos(workspace: str):
    md = _todos_for_workspace(workspace).export_markdown()
    return PlainTextResponse(md, media_type="text/markdown; charset=utf-8")


@app.post("/workspaces/todos/import", response_model=TodoListResponse)
def import_workspace_todos(body: ImportTodosRequest):
    api = _todos_for_workspace(body.workspace)
    store = api.import_markdown(body.markdown, merge=body.merge)
    return _todo_list_response(store)


@app.post("/workspaces/todos/import-agent-plan", response_model=TodoListResponse)
def import_workspace_agent_todo_plan(workspace: str):
    """Pull Cecli agent ``todo.txt`` into workspace Tasks (``.cecli/todos.json``)."""
    store = try_import_agent_plan_for_workspace(workspace)
    if store is None:
        raise HTTPException(status_code=404, detail="No Cecli agent todo.txt in this workspace")
    return _todo_list_response(store)


@app.post("/sessions/{session_id}/todos/import-agent-plan", response_model=TodoListResponse)
def import_session_agent_todo_plan(session_id: str):
    """Sync this session's agent todo.txt ↔ workspace Tasks."""
    session = _get_session(session_id)
    store, _warnings = sync_session_agent_todos(session, pull=True, push_active=True)
    return _todo_list_response(store)


@app.get("/sessions/{session_id}/todos", response_model=TodoListResponse)
def list_session_todos(session_id: str):
    session = _get_session(session_id)
    return _todo_list_response(_workspace_todos(session).load())


@app.post("/sessions/{session_id}/todos", response_model=TodoItemModel)
def create_session_todo(session_id: str, body: CreateTodoRequest):
    session = _get_session(session_id)
    api = _workspace_todos(session)
    item = api.add(body.title, body.spec, template=body.template)
    return _todo_item_model(item)


@app.patch("/sessions/{session_id}/todos/{todo_id}", response_model=PatchTodoResponse)
def patch_session_todo(session_id: str, todo_id: str, body: PatchTodoRequest):
    session = _get_session(session_id)
    return _patch_todo_api(_workspace_todos(session), todo_id, body)


def _validate_generate_mode(mode: str) -> None:
    if mode not in ("generate", "refine"):
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")


def _validate_generate_section(section: str) -> None:
    if section not in ("all", "requirements", "design", "tasks_md"):
        raise HTTPException(status_code=400, detail=f"Invalid section: {section}")


def _job_status_response(job) -> GenerateTodoSpecJobStatus:
    item = job.item
    return GenerateTodoSpecJobStatus(
        job_id=job.job_id,
        status=job.status,
        todo_id=job.todo_id,
        error=job.error,
        requirements=job.requirements,
        design=job.design,
        tasks_md=job.tasks_md,
        raw=job.raw,
        item=_todo_item_model(item) if item else None,
        ears_blocked=getattr(job, "ears_blocked", False),
        ears_issues=[
            EarsIssueModel.model_validate(i)
            for i in (getattr(job, "ears_issues", None) or [])
        ],
    )


def _start_spec_job(
    workspace: str,
    todo_id: str,
    body: GenerateTodoSpecRequest,
    *,
    model: str | None,
) -> GenerateTodoSpecJobStarted:
    _validate_generate_mode(body.mode)
    _validate_generate_section(body.section)
    root = Path(workspace).resolve()
    if not root.is_dir():
        raise HTTPException(status_code=404, detail=f"Not a directory: {workspace}")
    try:
        WorkspaceTodos(root).get(todo_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    job = spec_job_store.start(
        str(root),
        todo_id,
        body.prompt,
        mode=body.mode,
        section=body.section,
        apply=body.apply,
        enforce_ears=body.enforce_ears,
        context_paths=body.context_paths,
        model=model,
        wall_timeout_s=body.wall_timeout_s,
        turn_timeout_s=body.turn_timeout_s,
    )
    return GenerateTodoSpecJobStarted(job_id=job.job_id, status=job.status, todo_id=todo_id)


def _wait_spec_job(job_id: str) -> GenerateTodoSpecResponse:
    job = spec_job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from bright_vision_core.todo_spec_jobs import job_wall_timeout_s

    try:
        job = spec_job_store.wait(job_id, timeout_s=job_wall_timeout_s(job) + 30.0)
    except KeyError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except TimeoutError as err:
        raise HTTPException(status_code=504, detail=str(err)) from err
    if job.status == "error":
        raise HTTPException(status_code=500, detail=job.error or "Spec generation failed")
    return GenerateTodoSpecResponse(
        job_id=job.job_id,
        status=job.status,
        requirements=job.requirements,
        design=job.design,
        tasks_md=job.tasks_md,
        raw=job.raw,
        item=_todo_item_model(job.item) if job.item else None,
        ears_blocked=getattr(job, "ears_blocked", False),
        ears_issues=[
            EarsIssueModel.model_validate(i)
            for i in (getattr(job, "ears_issues", None) or [])
        ],
    )


class FilterWorkspacePathsRequest(BaseModel):
    paths: list[str] = Field(default_factory=list)


class FilterWorkspacePathsResponse(BaseModel):
    existing: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)


@app.post("/workspaces/filter-paths", response_model=FilterWorkspacePathsResponse)
def filter_workspace_paths(workspace: str, body: FilterWorkspacePathsRequest):
    """Return which repo-relative paths exist on disk (suggested-files tray)."""
    existing, missing = filter_existing_workspace_paths(workspace, body.paths)
    return FilterWorkspacePathsResponse(existing=existing, missing=missing)


@app.post("/workspaces/todos/{todo_id}/sync-spec-files", response_model=TodoItemModel)
def sync_workspace_spec_files(workspace: str, todo_id: str):
    """Import three-layer markdown from ``.cecli/specs/{id}/`` into todos.json."""
    api = _todos_for_workspace(workspace)
    try:
        item = api.import_spec_files(todo_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    return _todo_item_model(item)


@app.post("/workspaces/todos/{todo_id}/export-spec-files", response_model=TodoItemModel)
def export_workspace_spec_files(workspace: str, todo_id: str):
    """Write three-layer markdown from todos.json to ``.cecli/specs/{id}/``."""
    api = _todos_for_workspace(workspace)
    try:
        item = api.get(todo_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    api.sync_spec_files(item)
    return _todo_item_model(item)


@app.get("/workspaces/spec-index", response_model=SpecIndexResponse)
def get_workspace_spec_index(workspace: str):
    """Scan ``.cecli/specs/**`` vs workspace task ids (roadmap #22)."""
    return _spec_index_response(_todos_for_workspace(workspace))


@app.get("/workspaces/steering-files", response_model=SteeringFilesResponse)
def get_workspace_steering_files(workspace: str):
    """List project steering markdown (``.cecli/STEERING.md``, ``.cecli/steering/*.md``)."""
    return _steering_files_response(workspace)


@app.post("/workspaces/steering-files/scaffold", response_model=SteeringScaffoldResponse)
def scaffold_workspace_steering_files(workspace: str):
    """Create ``.cecli/STEERING.md`` from template when missing."""
    from bright_vision_core.spec_steering import scaffold_steering_files

    created = scaffold_steering_files(workspace)
    base = _steering_files_response(workspace)
    return SteeringScaffoldResponse(created=created, **base.model_dump())


class RepairSpecFoldersResponse(BaseModel):
    created_count: int
    created_ids: list[str] = Field(default_factory=list)


class PruneOrphanSpecFoldersResponse(BaseModel):
    removed_count: int
    removed_ids: list[str] = Field(default_factory=list)


@app.post("/workspaces/todos/repair-spec-folders", response_model=RepairSpecFoldersResponse)
def repair_workspace_spec_folders(workspace: str):
    """Create missing spec folders and write three-layer markdown from todos.json."""
    api = _todos_for_workspace(workspace)
    count, ids = api.repair_spec_folders()
    return RepairSpecFoldersResponse(created_count=count, created_ids=ids)


@app.post(
    "/workspaces/todos/prune-orphan-spec-folders",
    response_model=PruneOrphanSpecFoldersResponse,
)
def prune_workspace_orphan_spec_folders(workspace: str):
    """Delete ``.cecli/specs/{id}/`` folders that are not in todos.json."""
    api = _todos_for_workspace(workspace)
    count, ids = api.prune_orphan_spec_folders()
    return PruneOrphanSpecFoldersResponse(removed_count=count, removed_ids=ids)


@app.post(
    "/workspaces/todos/{todo_id}/lint-requirements",
    response_model=EarsLintResponse,
)
def lint_workspace_requirements(
    workspace: str,
    todo_id: str,
    body: LintRequirementsRequest | None = None,
):
    """Deterministic EARS lint (see ``bright_vision_core.ears``)."""
    return _lint_todo_requirements(_todos_for_workspace(workspace), todo_id, body)


@app.post(
    "/workspaces/todos/{todo_id}/trace-spec",
    response_model=TraceabilityResponse,
)
def trace_workspace_spec(
    workspace: str,
    todo_id: str,
    body: TraceSpecRequest | None = None,
):
    """REQ ↔ design ↔ tasks traceability for one task."""
    return _trace_todo_spec(_todos_for_workspace(workspace), todo_id, body)


@app.get(
    "/workspaces/todos/{todo_id}/implementation-progress",
    response_model=ImplementationProgressResponse,
)
def get_workspace_implementation_progress(workspace: str, todo_id: str):
    """Unified checklist + tasks_md progress (next open step, verify commands)."""
    return _implementation_progress_response(_todos_for_workspace(workspace), todo_id)


@app.post(
    "/workspaces/todos/{todo_id}/materialize-checklist",
    response_model=TodoItemModel,
)
def materialize_workspace_checklist(workspace: str, todo_id: str):
    """Build checklist rows from numbered tasks_md lines."""
    return _materialize_todo_checklist(_todos_for_workspace(workspace), todo_id)


@app.post("/workspaces/repair-pubspec", response_model=PubspecRepairResponse)
def repair_workspace_pubspec(workspace: str, apply: bool = False):
    """Detect or add missing Dart package dependencies for Flutter workspaces."""
    from cecli.spec.pubspec_repair import repair_pubspec_dependencies

    result = repair_pubspec_dependencies(workspace, apply=apply)
    return PubspecRepairResponse(
        missing=list(result.missing),
        added=list(result.added),
        applied=result.applied,
        message=result.message,
    )


@app.post("/sessions/{session_id}/todos/{todo_id}/sync-spec-files", response_model=TodoItemModel)
def sync_session_spec_files(session_id: str, todo_id: str):
    session = _get_session(session_id)
    try:
        item = _workspace_todos(session).import_spec_files(todo_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    return _todo_item_model(item)


@app.post(
    "/sessions/{session_id}/todos/{todo_id}/lint-requirements",
    response_model=EarsLintResponse,
)
def lint_session_requirements(
    session_id: str,
    todo_id: str,
    body: LintRequirementsRequest | None = None,
):
    session = _get_session(session_id)
    return _lint_todo_requirements(_workspace_todos(session), todo_id, body)


@app.get("/sessions/{session_id}/spec-index", response_model=SpecIndexResponse)
def get_session_spec_index(session_id: str):
    session = _get_session(session_id)
    return _spec_index_response(_workspace_todos(session))


@app.post(
    "/sessions/{session_id}/todos/{todo_id}/trace-spec",
    response_model=TraceabilityResponse,
)
def trace_session_spec(
    session_id: str,
    todo_id: str,
    body: TraceSpecRequest | None = None,
):
    session = _get_session(session_id)
    return _trace_todo_spec(_workspace_todos(session), todo_id, body)


@app.get("/workspaces/todos/generate-spec/{job_id}", response_model=GenerateTodoSpecJobStatus)
def get_workspace_spec_job(job_id: str):
    job = spec_job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_status_response(job)


@app.get("/workspaces/todos/generate-spec/{job_id}/debug")
def get_workspace_spec_job_debug(job_id: str):
    """Export debug bundle for a background spec generation job (live or finished)."""
    job = spec_job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    spec_job_store.snapshot_job_if_live(job_id)
    job = spec_job_store.get(job_id)
    payload = build_spec_job_debug_export(job)  # type: ignore[arg-type]
    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": (
                f'attachment; filename="brightvision-spec-job-{job_id[:8]}-debug.json"'
            ),
        },
    )


@app.get("/sessions/{session_id}/todos/generate-spec/{job_id}", response_model=GenerateTodoSpecJobStatus)
def get_session_spec_job(session_id: str, job_id: str):
    _get_session(session_id)
    job = spec_job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_status_response(job)


@app.get("/sessions/{session_id}/todos/generate-spec/{job_id}/debug")
def get_session_spec_job_debug(session_id: str, job_id: str):
    _get_session(session_id)
    job = spec_job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    spec_job_store.snapshot_job_if_live(job_id)
    job = spec_job_store.get(job_id)
    payload = build_spec_job_debug_export(job)  # type: ignore[arg-type]
    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": (
                f'attachment; filename="brightvision-spec-job-{job_id[:8]}-debug.json"'
            ),
        },
    )


@app.post(
    "/sessions/{session_id}/todos/{todo_id}/generate-spec",
    response_model=None,
)
def generate_session_todo_spec(session_id: str, todo_id: str, body: GenerateTodoSpecRequest):
    session = _get_session(session_id)
    model = session.coder.main_model.name
    workspace = str(Path(session.coder.root).resolve())
    started = _start_spec_job(workspace, todo_id, body, model=model)
    if body.background:
        return JSONResponse(status_code=202, content=started.model_dump())
    return _wait_spec_job(started.job_id)


@app.post("/workspaces/todos/{todo_id}/generate-spec", response_model=None)
def generate_workspace_todo_spec(
    workspace: str,
    todo_id: str,
    body: GenerateTodoSpecRequest,
    session_id: str,
):
    """Start spec generation; ``session_id`` supplies the model name and workspace check."""
    session = _get_session(session_id)
    root = Path(workspace).resolve()
    if Path(session.coder.root).resolve() != root:
        raise HTTPException(
            status_code=400,
            detail="Session workspace does not match workspace query parameter",
        )
    started = _start_spec_job(
        str(root),
        todo_id,
        body,
        model=session.coder.main_model.name,
    )
    if body.background:
        return JSONResponse(status_code=202, content=started.model_dump())
    return _wait_spec_job(started.job_id)


@app.delete("/sessions/{session_id}/todos/{todo_id}")
def delete_session_todo(session_id: str, todo_id: str):
    session = _get_session(session_id)
    try:
        _workspace_todos(session).delete(todo_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    return {"deleted": todo_id}


@app.put("/sessions/{session_id}/todos/active", response_model=TodoListResponse)
def set_session_active_todo(session_id: str, body: SetActiveTodoRequest):
    session = _get_session(session_id)
    api = _workspace_todos(session)
    try:
        store = api.set_active(body.active_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    return _todo_list_response(store)


def _session_info(session_id: str, session: Session) -> SessionInfo:
    return SessionInfo(
        session_id=session_id,
        workspace=session.coder.root,
        model=session.coder.main_model.name,
        files_in_chat=session.coder.get_inchat_relative_files(),
    )


@app.post("/sessions/{session_id}/files", response_model=AddFilesResponse)
def add_session_files(session_id: str, body: AddFilesRequest):
    session = _get_session(session_id)
    events = session.add_files(body.paths)
    return AddFilesResponse(
        files_in_chat=session.coder.get_inchat_relative_files(),
        events=events,
    )


@app.post("/sessions/{session_id}/files/upload", response_model=AddFilesResponse)
def upload_session_files(session_id: str, body: UploadFilesRequest):
    session = _get_session(session_id)
    items: list[tuple[str, bytes]] = []
    for part in body.files:
        try:
            data = Session.decode_upload(part.content_base64)
        except Exception as err:
            raise HTTPException(status_code=400, detail=f"Invalid base64 for {part.filename}: {err}") from err
        items.append((part.filename, data))
    events = session.upload_files(items)
    return AddFilesResponse(
        files_in_chat=session.coder.get_inchat_relative_files(),
        events=events,
    )


@app.post("/sessions/{session_id}/interrupt")
def interrupt_session_turn(session_id: str):
    """Stop an in-flight turn (UI Stop); complements SSE disconnect."""
    session = _get_session(session_id)
    session.interrupt_turn()
    return {"ok": True}


@app.post("/sessions/{session_id}/messages")
def post_message(session_id: str, body: MessageRequest):
    session = _get_session(session_id)

    def generate():
        try:
            for event in session.run_message(
                body.content,
                preproc=body.preproc,
                active_todo_id=body.active_todo_id,
                inject_todo_spec=body.inject_todo_spec,
                spec_focus=body.spec_focus,
                force_tier=body.force_tier,
                escalate_from_last=body.escalate_from_last,
            ):
                yield _sse_pack(event)
        except (BrokenPipeError, ConnectionResetError) as err:
            yield _sse_pack({"type": "error", "text": str(err)})
            yield _sse_pack({"type": "done", "error": True})
        except OSError as err:
            if err.errno != 32:
                raise
            yield _sse_pack({"type": "error", "text": str(err)})
            yield _sse_pack({"type": "done", "error": True})
        except GeneratorExit:
            session.interrupt_turn()
            return

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/sessions/{session_id}/confirm")
def post_confirm(session_id: str, body: ConfirmRequest):
    session = _get_session(session_id)
    if not session.io.resolve_confirm(body.confirm_id, body.answer):
        raise HTTPException(status_code=404, detail="Unknown or expired confirmation")
    return {"ok": True, "confirm_id": body.confirm_id, "answer": body.answer}


@app.post("/sessions/{session_id}/undo")
def post_undo(session_id: str):
    session = _get_session(session_id)
    undo_last_aider_commit_for_coder(session.coder, session.io)
    events = session.io.drain_events()
    return {
        "events": events,
        "commits": session.coder.aider_commit_stack,
        "last_commit_hash": session.coder.last_aider_commit_hash,
    }


def _get_session(session_id: str) -> Session:
    with _lock:
        session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
