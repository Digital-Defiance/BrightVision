"""
Headless cecli sessions for API / web frontends.
"""

from __future__ import annotations

import base64
import concurrent.futures
import os
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, Iterator, Literal, TypeVar

SessionMode = Literal["vibe", "spec"]

_T = TypeVar("_T")

from cecli import models
from cecli.coders import Coder
from cecli.commands import Commands, SwitchCoderSignal
from cecli.commands.add import AddCommand
from cecli.commands.utils.helpers import quote_filename
from cecli.utils import is_image_file

from bright_vision_core.async_bridge import (
    HEARTBEAT_PULSE,
    iterate_async_with_heartbeats,
    rebind_coder_loop_primitives,
    run,
)
from bright_vision_core.gui_progress import emit_progress
from bright_vision_core.event_io import EventIO
from bright_vision_core.git_undo import undo_last_aider_commit_for_coder
from bright_vision_core.git_workspace import create_git_workspace
from bright_vision_core.headless_args import default_headless_args
from bright_vision_core.headless_persistence import apply_persistence_to_args
from bright_vision_core.ears.prompt import requirements_pass_ears
from bright_vision_core.spec_steering import build_spec_focus_preamble
from bright_vision_core.spec_layers import normalize_spec_layer_traceability
from bright_vision_core.roadmap_hints import maybe_append_roadmap_hint
from bright_vision_core.slash_helpers import (
    fast_slash_preproc_timeout_s,
    is_switch_coder_signal,
    resolve_slash_command_name,
    run_slash_command_sync,
    slash_preproc_timeout_s,
)
from bright_vision_core.workspace_paths import attachments_dir, attachments_prefix
from bright_vision_core.model_router import (
    ModelRouterConfig,
    RouteDecision,
    classify_prompt,
    estimate_message_tokens,
    estimate_prompt_tokens,
    should_escalate_fast_turn,
)
from bright_vision_core.model_router_apply import apply_route_to_coder
from bright_vision_core.llm_progress import llm_wait_messages
from bright_vision_core.workspace_todos import WorkspaceTodos, format_todo_context


def _edited_files(coder) -> list[str]:
    raw = (
        getattr(coder, "aider_edited_files", None)
        or getattr(coder, "files_edited_by_tools", None)
        or getattr(coder, "coder_edited_files", None)
        or set()
    )
    return sorted(raw) if raw else []


def _done_commit_fields(coder) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    last_hash = getattr(coder, "last_aider_commit_hash", None)
    last_msg = getattr(coder, "last_aider_commit_message", None)
    if last_hash:
        payload["commit_hash"] = last_hash
        payload["commit_message"] = last_msg
    stack = getattr(coder, "aider_commit_stack", None)
    if stack:
        payload["commits"] = stack[-1]
    return payload


def _drain_io_events(
    io: EventIO,
    *,
    mirror_assistant_complete: bool = False,
    assistant_text: list[str] | None = None,
) -> Iterator[dict[str, Any]]:
    """
    Yield pending IO events. Slash/preproc turns (e.g. ``/agent``) finish via
    ``generate()`` → ``ai_output`` → ``assistant_complete`` without ``token``
    events; optionally mirror that text to ``token`` for SSE/UI parity.
    """
    for event in io.drain_events():
        if mirror_assistant_complete and event.get("type") == "assistant_complete":
            text = str(event.get("text") or "")
            if text.strip():
                if assistant_text is not None:
                    assistant_text.append(text)
                yield event
                yield io.emit("token", text=text)
                continue
        yield event


def _run_blocking_with_sse_pulses(
    io: EventIO,
    fn: Callable[[], _T],
    *,
    label: str = "Vision",
    message: str = "Working…",
    interval_s: float = 8.0,
    mirror_assistant_complete: bool = False,
    assistant_text: list[str] | None = None,
    timeout_s: float | None = None,
    on_timeout: Callable[[], None] | None = None,
) -> Iterator[dict[str, Any] | _T]:
    """Run blocking work in a thread; emit progress and yield so SSE stays alive."""
    wait_s = max(2.0, interval_s)
    done = threading.Event()
    result: list[_T] = []
    error: list[BaseException] = []
    started = time.monotonic()

    def worker() -> None:
        try:
            result.append(fn())
        except BaseException as err:
            error.append(err)
        finally:
            done.set()

    threading.Thread(target=worker, daemon=True).start()
    pulse = 0
    while not done.wait(timeout=wait_s):
        if timeout_s is not None and time.monotonic() - started > timeout_s:
            if on_timeout:
                on_timeout()
            done.wait(timeout=3.0)
            raise TimeoutError(f"{message} timed out after {int(timeout_s)}s")
        pulse += 1
        emit_progress(io, label=label, message=f"{message} ({int(pulse * wait_s)}s)")
        yield from _drain_io_events(
            io,
            mirror_assistant_complete=mirror_assistant_complete,
            assistant_text=assistant_text,
        )
    if error:
        yield from _drain_io_events(
            io,
            mirror_assistant_complete=mirror_assistant_complete,
            assistant_text=assistant_text,
        )
        raise error[0]
    yield from _drain_io_events(
        io,
        mirror_assistant_complete=mirror_assistant_complete,
        assistant_text=assistant_text,
    )
    yield result[0]


class Session:
    """A headless coder session with event-streaming support."""

    def __init__(
        self,
        coder: Coder,
        io: EventIO,
        *,
        model_router: ModelRouterConfig | None = None,
        spec_focus: bool = False,
        session_mode: SessionMode = "vibe",
    ):
        self.coder = coder
        self.io = io
        self._model_router = model_router
        self._router_heavy_model_name = coder.main_model.name
        self._last_route: RouteDecision | None = None
        self.session_mode: SessionMode = session_mode
        self.spec_focus = spec_focus or session_mode == "spec"
        self.coder.yield_stream = True
        self.coder.stream = bool(coder.stream)
        self.coder.pretty = False
        self.coder.commands.io = io
        self.coder.commands.coder = coder

    def interrupt_turn(self) -> None:
        """Signal the active cecli turn to stop (HTTP disconnect or slash timeout)."""
        rebind_coder_loop_primitives(self.coder)
        self.coder.interrupt_event.set()

    def sync_agent_todos_with_workspace(self) -> None:
        """Pull Cecli agent todo.txt into workspace Tasks before turn end."""
        try:
            from bright_vision_core.agent_todos import sync_session_agent_todos

            sync_session_agent_todos(self, pull=True, push_active=True)
        except Exception:
            import logging

            logging.getLogger(__name__).debug("agent todo sync skipped", exc_info=True)

    @classmethod
    def create(
        cls,
        workspace_dir: str,
        files: list[str] | None = None,
        model: str | None = None,
        *,
        yes: bool = False,
        stream: bool = True,
        auto_commits: bool = True,
        dirty_commits: bool = True,
        dry_run: bool = False,
        map_tokens: int | None = None,
        on_event=None,
        echo_to_console: bool = False,
        model_router: ModelRouterConfig | dict[str, Any] | None = None,
        session_encrypt: bool = False,
        session_key_file: str | None = None,
        auto_save: bool = False,
        auto_load: bool = False,
        auto_save_session_name: str = "brightvision",
        chat_history_file: bool | str | None = True,
        spec_focus: bool = False,
        session_mode: SessionMode = "vibe",
    ) -> Session:
        workspace = Path(workspace_dir).resolve()
        if not workspace.is_dir():
            raise FileNotFoundError(f"Workspace not found: {workspace}")

        from bright_vision_core.vision_runtime import configure_vision_runtime, purge_legacy_tag_caches

        configure_vision_runtime()
        purge_legacy_tag_caches(workspace)

        prev_cwd = os.getcwd()
        os.chdir(workspace)
        try:
            cecli_meta = workspace / ".cecli"
            if chat_history_file is True:
                chat_hist_path = str(cecli_meta / "chat.history")
            elif chat_history_file:
                chat_hist_path = str(Path(chat_history_file).expanduser())
            else:
                chat_hist_path = None
            io_kwargs: dict[str, Any] = {
                "yes": yes,
                "pretty": False,
                "on_event": on_event,
                "echo_to_console": echo_to_console,
            }
            if chat_hist_path:
                io_kwargs["chat_history_file"] = chat_hist_path
            io = EventIO(**io_kwargs)
            model_name = model or models.DEFAULT_MODEL_NAME
            router_cfg = (
                ModelRouterConfig.from_payload(model_router)
                if isinstance(model_router, dict)
                else model_router
            )
            if router_cfg is None:
                router_cfg = ModelRouterConfig.from_env()
            if router_cfg and router_cfg.enabled and not router_cfg.heavy_model:
                router_cfg.heavy_model = model_name

            main_model = models.Model(model_name)
            if main_model.is_ollama() and not (router_cfg and router_cfg.enabled):
                main_model._ensure_extra_params_dict()
                main_model.extra_params.setdefault("keep_alive", -1)

            fnames = [str(Path(f).resolve()) for f in (files or [])]

            repo = None
            try:
                repo = create_git_workspace(
                    io,
                    fnames if fnames else [str(workspace)],
                    str(workspace),
                    models=main_model.commit_message_models(),
                )
            except FileNotFoundError:
                pass

            if map_tokens is None:
                map_tokens = main_model.get_repo_map_tokens()

            commands = Commands(io, None)
            headless_args = apply_persistence_to_args(
                default_headless_args(yes=yes),
                session_encrypt=session_encrypt,
                session_key_file=session_key_file,
                auto_save=auto_save,
                auto_load=auto_load,
                auto_save_session_name=auto_save_session_name,
            )
            coder = run(
                Coder.create(
                    main_model=main_model,
                    io=io,
                    repo=repo,
                    fnames=fnames,
                    stream=stream and main_model.streaming,
                    auto_commits=auto_commits,
                    dirty_commits=dirty_commits,
                    dry_run=dry_run,
                    map_tokens=map_tokens,
                    commands=commands,
                    use_git=repo is not None,
                    args=headless_args,
                )
            )
            commands.coder = coder
            rebind_coder_loop_primitives(coder)
            if headless_args.auto_load:
                from cecli.sessions import SessionManager

                manager = SessionManager(coder, io)
                name = headless_args.auto_save_session_name or "auto-save"
                try:
                    run(manager.load_session(name, switch=False, quiet=True))
                except Exception:
                    pass
                io.drain_events()
            return cls(
                coder,
                io,
                model_router=router_cfg if router_cfg and router_cfg.enabled else None,
                spec_focus=spec_focus,
                session_mode=session_mode,
            )
        finally:
            os.chdir(prev_cwd)

    def _estimate_turn_tokens(self, user_message: str) -> int:
        files_n = len(self.coder.get_inchat_relative_files())
        try:
            cur = self.coder.get_cur_messages()
            if cur:
                return self.coder.main_model.token_count(cur)
        except Exception:
            pass
        return estimate_prompt_tokens(user_message, files_in_chat=files_n)

    def _emit_model_route(
        self,
        decision: RouteDecision,
        *,
        escalated: bool = False,
        load_ms: int | None = None,
        swapped: bool | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "tier": decision.tier,
            "model": decision.model_name,
            "estimated_tokens": decision.estimated_tokens,
            "reasons": decision.reasons,
            "escalated": escalated,
        }
        if load_ms is not None:
            payload["load_ms"] = load_ms
        if swapped is not None:
            payload["swapped"] = swapped
        return self.io.emit("model_route", **payload)

    def _route_and_apply(
        self,
        user_message: str,
        *,
        force_tier: str | None = None,
    ) -> RouteDecision | None:
        router = self._model_router
        if not router or not router.enabled:
            return None
        heavy = router.heavy_model or self._router_heavy_model_name
        message_tokens = estimate_message_tokens(user_message)
        context_tokens = self._estimate_turn_tokens(user_message)
        tier_force = force_tier if force_tier in ("fast", "heavy") else None
        decision = classify_prompt(
            user_message,
            message_tokens=message_tokens,
            context_tokens=context_tokens,
            router=router,
            heavy_model_name=heavy,
            force_tier=tier_force,
        )
        apply_route_to_coder(self.coder, decision, router)
        self._last_route = decision
        return decision

    def run_message(
        self,
        message: str,
        *,
        preproc: bool = True,
        skip_workspace_init: bool = False,
        active_todo_id: str | None = None,
        inject_todo_spec: bool = False,
        spec_focus: bool = False,
        force_tier: str | None = None,
        escalate_from_last: bool = False,
    ) -> Iterator[dict[str, Any]]:
        turn_todo_id: str | None = None
        user_text = maybe_append_roadmap_hint(message, self.coder)
        focus = spec_focus or self.spec_focus or self.session_mode == "spec"
        if active_todo_id:
            todos = WorkspaceTodos(self.coder.root)
            store = todos.load()
            item = todos.find(store, active_todo_id)
            if item:
                turn_todo_id = item.id
                if inject_todo_spec or focus:
                    user_text = format_todo_context(item, store=store) + message
        if focus:
            user_text = build_spec_focus_preamble(self.coder.root) + user_text

        self.io.emit("user_message", text=user_text)
        for event in self.io.drain_events():
            yield event
        assistant_text: list[str] = []
        self.coder.interrupt_event.clear()

        try:
            if not skip_workspace_init:
                emit_progress(self.io, label="Vision", message="Preparing workspace…")
                yield from _drain_io_events(self.io)

                for item in _run_blocking_with_sse_pulses(
                    self.io,
                    self.coder.init_before_message,
                    label="Vision",
                    message="Preparing workspace",
                ):
                    if isinstance(item, dict):
                        yield item
            self.io.user_input(user_text)

            user_msg = user_text
            if preproc:
                emit_progress(self.io, label="Vision", message="Running slash commands…")
                yield from _drain_io_events(self.io)

                def _preproc() -> str | None:
                    rebind_coder_loop_primitives(self.coder)

                    async def _preproc_coro():
                        return await self.coder.preproc_user_input(user_text)

                    return run(_preproc_coro())

                preproc_timeout = slash_preproc_timeout_s(user_text, self.coder.commands)
                try:
                    for item in _run_blocking_with_sse_pulses(
                        self.io,
                        _preproc,
                        label="Vision",
                        message="Running slash commands",
                        mirror_assistant_complete=True,
                        assistant_text=assistant_text,
                        timeout_s=preproc_timeout,
                        on_timeout=self.interrupt_turn if preproc_timeout else None,
                    ):
                        if isinstance(item, dict):
                            yield item
                        else:
                            user_msg = item
                except TimeoutError as err:
                    yield from _drain_io_events(
                        self.io,
                        mirror_assistant_complete=True,
                        assistant_text=assistant_text,
                    )
                    cmd = resolve_slash_command_name(user_text, self.coder.commands)
                    if cmd == "agent":
                        cap_hint = (
                            "Unset VISION_AGENT_PREPROC_TIMEOUT_S or set it to 0 for no wall-clock cap "
                            "(default). Use Stop to cancel a long agent run."
                        )
                    elif cmd in ("invoke-agent", "ask", "code", "architect", "context", "hashline"):
                        cap_hint = (
                            "Long mode commands default to no preproc cap; set "
                            "VISION_AGENT_PREPROC_TIMEOUT_S to limit. Use Stop to cancel."
                        )
                    else:
                        cap_hint = (
                            f"Cap: VISION_SLASH_PREPROC_TIMEOUT_S (default "
                            f"{int(fast_slash_preproc_timeout_s())}s)."
                        )
                    yield self.io.emit(
                        "error",
                        text=(
                            f"{err}. Use Stop, then retry. "
                            "For quick UI tweaks, send your request without /agent. "
                            f"{cap_hint}"
                        ),
                    )
                    self.sync_agent_todos_with_workspace()
                    yield self.io.emit(
                        "done",
                        assistant_text="".join(assistant_text),
                        error=True,
                    )
                    return

            if user_msg is None:
                yield from _drain_io_events(
                    self.io,
                    mirror_assistant_complete=True,
                    assistant_text=assistant_text,
                )
                self.sync_agent_todos_with_workspace()
                yield self.io.emit("done", assistant_text="".join(assistant_text))
                return

            for event in self.io.drain_events():
                yield event

            route_decision: RouteDecision | None = None
            if escalate_from_last and self._model_router and self._model_router.enabled:
                route_decision = self._route_and_apply(user_msg, force_tier="heavy")
                if route_decision:
                    yield self._emit_model_route(route_decision, escalated=True)
                    for event in self.io.drain_events():
                        yield event
            elif self._model_router and self._model_router.enabled:
                route_decision = self._route_and_apply(user_msg, force_tier=force_tier)
                if route_decision:
                    yield self._emit_model_route(route_decision)
                    for event in self.io.drain_events():
                        yield event

            turn_had_tool_error = False
            max_attempts = 2 if self._model_router and self._model_router.escalate_on_failure else 1
            for attempt in range(max_attempts):
                if attempt > 0 and route_decision:
                    route_decision = self._route_and_apply(user_msg, force_tier="heavy")
                    yield self._emit_model_route(route_decision, escalated=True)
                    for event in self.io.drain_events():
                        yield event

                wait_initial, wait_heartbeat = llm_wait_messages(self.coder.main_model)
                emit_progress(self.io, label="LLM", message=wait_initial)
                for event in self.io.drain_events():
                    yield event

                attempt_text: list[str] = []
                for piece in iterate_async_with_heartbeats(
                    lambda: self.coder.send_message(user_msg),
                    self.io,
                    coder=self.coder,
                    label="LLM",
                    message=wait_heartbeat,
                ):
                    for event in self.io.drain_events():
                        if event.get("type") == "tool_error":
                            turn_had_tool_error = True
                        yield event
                    if piece is HEARTBEAT_PULSE:
                        continue
                    if piece:
                        attempt_text.append(piece)
                        assistant_text.append(piece)
                        yield self.io.emit("token", text=piece)

                for event in self.io.drain_events():
                    if event.get("type") == "tool_error":
                        turn_had_tool_error = True
                    yield event

                edited = _edited_files(self.coder)
                if (
                    attempt == 0
                    and route_decision
                    and self._model_router
                    and should_escalate_fast_turn(
                        route_decision,
                        router=self._model_router,
                        user_message=user_msg,
                        edited_files=edited,
                        assistant_text="".join(attempt_text),
                        had_tool_error=turn_had_tool_error,
                    )
                ):
                    assistant_text.clear()
                    continue
                break

            edited = _edited_files(self.coder)
            payload: dict[str, Any] = {
                "assistant_text": "".join(assistant_text),
                "edited_files": edited,
                **_done_commit_fields(self.coder),
            }

            if turn_todo_id:
                payload["active_todo_id"] = turn_todo_id
                links: list[str] = list(edited)
                last_hash = getattr(self.coder, "last_aider_commit_hash", None)
                if last_hash:
                    links.append(f"commit:{last_hash}")
                WorkspaceTodos(self.coder.root).append_links(links, todo_id=turn_todo_id)

            self.sync_agent_todos_with_workspace()
            yield self.io.emit("done", **payload)
        except BaseException as err:
            if is_switch_coder_signal(err):
                yield from _drain_io_events(
                    self.io,
                    mirror_assistant_complete=True,
                    assistant_text=assistant_text,
                )
                self.sync_agent_todos_with_workspace()
                yield self.io.emit("done", assistant_text="".join(assistant_text))
                return
            if isinstance(err, BrokenPipeError):
                yield self.io.emit("error", text=str(err))
                self.sync_agent_todos_with_workspace()
                yield self.io.emit("done", assistant_text="".join(assistant_text), error=True)
                return
            if isinstance(err, Exception):
                yield self.io.emit("error", text=str(err))
                self.sync_agent_todos_with_workspace()
                yield self.io.emit("done", assistant_text="".join(assistant_text), error=True)
                return
            raise

    def _resolve_workspace_file(self, raw: str) -> str | None:
        """Return workspace-relative posix path for an on-disk file, or None after tool_error."""
        workspace = Path(self.coder.root).resolve()
        p = Path(raw.strip().lstrip("@"))
        if not p.is_absolute():
            p = workspace / p
        p = p.resolve()
        if not p.is_file():
            self.io.tool_error(f"Not a file: {p}")
            return None
        try:
            return p.relative_to(workspace).as_posix()
        except ValueError:
            self.io.tool_error(f"File outside workspace: {p}")
            return None

    def _add_matched_file_to_chat(self, rel: str) -> bool:
        """Add one file like cecli ``/add`` without create-file confirms."""
        coder = self.coder
        io = self.io
        abs_file_path = coder.abs_root_path(rel)

        blocked = AddCommand._add_blocked_message(coder, rel)
        if blocked:
            io.tool_error(blocked)
            return False

        if abs_file_path in coder.abs_fnames:
            io.tool_output(f"{rel} is already in the chat")
            return True
        if abs_file_path in coder.abs_read_only_stubs_fnames:
            if coder.repo and coder.repo.path_in_repo(rel):
                coder.abs_read_only_stubs_fnames.remove(abs_file_path)
                coder.abs_fnames.add(abs_file_path)
                io.tool_output(f"Moved {rel} from read-only (stub) to editable files in the chat")
            else:
                io.tool_error(f"Cannot add {rel} as it's not part of the repository")
                return False
        elif abs_file_path in coder.abs_read_only_fnames:
            if coder.repo and coder.repo.path_in_repo(rel):
                coder.abs_read_only_fnames.remove(abs_file_path)
                coder.abs_fnames.add(abs_file_path)
                io.tool_output(f"Moved {rel} from read-only to editable files in the chat")
            else:
                io.tool_error(f"Cannot add {rel} as it's not part of the repository")
                return False
        else:
            if is_image_file(rel) and not coder.main_model.info.get("supports_vision"):
                io.tool_error(
                    f"Cannot add image file {rel} as the {coder.main_model.name} "
                    "does not support images."
                )
                return False
            content = io.read_text(abs_file_path)
            if content is None:
                io.tool_error(f"Unable to read {rel}")
                return False
            coder.abs_fnames.add(abs_file_path)
            io.tool_output(f"Added {rel} to the chat")
            coder.check_added_files()
            if hasattr(coder, "use_enhanced_context") and coder.use_enhanced_context:
                if hasattr(coder, "_calculate_context_block_tokens"):
                    coder._calculate_context_block_tokens()
        return True

    def _finish_file_adds_like_slash_add(self) -> None:
        """Match cecli ``/add`` post-success coder refresh (SwitchCoderSignal)."""
        coder = self.coder
        if coder.repo_map:
            map_tokens = coder.repo_map.max_map_tokens
            map_mul_no_files = coder.repo_map.map_mul_no_files
        else:
            map_tokens = 0
            map_mul_no_files = 1
        raise SwitchCoderSignal(
            edit_format=coder.edit_format,
            summarize_from_coder=False,
            from_coder=coder,
            map_tokens=map_tokens,
            map_mul_no_files=map_mul_no_files,
            show_announcements=False,
        )

    def add_files(self, paths: list[str]) -> list[dict[str, Any]]:
        if not paths:
            return []

        attach_prefix = attachments_prefix()
        quoted: list[str] = []
        direct_added = False
        for raw in paths:
            rel = self._resolve_workspace_file(raw)
            if rel is None:
                continue
            if rel.startswith(attach_prefix):
                if self._add_matched_file_to_chat(rel):
                    direct_added = True
                continue
            quoted.append(quote_filename(rel))

        try:
            if quoted:
                run_slash_command_sync(self.coder, "add", " ".join(quoted))
            elif direct_added:
                self._finish_file_adds_like_slash_add()
        except BaseException as exc:
            if not is_switch_coder_signal(exc):
                raise

        return self.io.drain_events()

    def stage_uploaded_file(self, filename: str, content: bytes) -> Path:
        workspace = Path(self.coder.root).resolve()
        attach_dir = attachments_dir(workspace)
        attach_dir.mkdir(parents=True, exist_ok=True)

        safe_name = Path(filename).name or "upload"
        dest = attach_dir / safe_name
        stem = dest.stem
        suffix = dest.suffix
        n = 1
        while dest.exists():
            dest = attach_dir / f"{stem}-{n}{suffix}"
            n += 1
        dest.write_bytes(content)
        return dest

    def upload_files(self, items: list[tuple[str, bytes]]) -> list[dict[str, Any]]:
        paths: list[str] = []
        for name, data in items:
            if len(data) > 20 * 1024 * 1024:
                self.io.tool_error(f"File too large (max 20MB): {name}")
                continue
            dest = self.stage_uploaded_file(name, data)
            paths.append(str(dest))
        return self.add_files(paths) if paths else self.io.drain_events()

    @staticmethod
    def decode_upload(content_base64: str) -> bytes:
        raw = content_base64.strip()
        if "," in raw and raw.startswith("data:"):
            raw = raw.split(",", 1)[1]
        return base64.b64decode(raw, validate=False)

    def undo(self) -> list[dict[str, Any]]:
        undo_last_aider_commit_for_coder(self.coder, self.io)
        return self.io.drain_events()

    def run_one_shot(
        self,
        message: str,
        *,
        timeout_s: float | None = None,
        skip_workspace_init: bool = False,
    ) -> str:
        def _consume() -> str:
            parts: list[str] = []
            for event in self.run_message(
                message,
                preproc=False,
                skip_workspace_init=skip_workspace_init,
            ):
                if event.get("type") == "token":
                    parts.append(str(event.get("text") or ""))
                elif event.get("type") == "done":
                    return str(event.get("assistant_text") or "".join(parts))
            return "".join(parts)

        if timeout_s is None:
            return _consume()

        pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        fut = pool.submit(_consume)
        try:
            return fut.result(timeout=timeout_s)
        except concurrent.futures.TimeoutError as err:
            try:
                self.interrupt_turn()
            except Exception:
                pass
            raise TimeoutError(f"One-shot turn timed out after {int(timeout_s)}s") from err
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

    def generate_todo_layers(
        self,
        todo_id: str,
        prompt: str,
        *,
        mode: str = "generate",
        section: str = "all",
        apply: bool = True,
        enforce_ears: bool = True,
        context_paths: list[str] | None = None,
    ) -> dict[str, Any]:
        from bright_vision_core.todo_spec_generate import (
            SpecSection,
            build_generate_message,
            merge_generated_layers,
            parse_generated_layers,
            validate_section_prerequisites,
        )

        api = WorkspaceTodos(self.coder.root)
        item = api.get(todo_id)
        sec: SpecSection = section if section in ("all", "requirements", "design", "tasks_md") else "all"
        if sec != "all" and mode != "generate":
            sec = "all"
        validate_section_prerequisites(item, sec)
        for path in context_paths or []:
            if str(path).strip():
                self.add_files([str(path).strip()])
        msg = build_generate_message(prompt, mode=mode, item=item, section=sec)  # type: ignore[arg-type]
        from bright_vision_core.todo_spec_jobs import spec_gen_turn_timeout_s

        raw = self.run_one_shot(
            msg,
            timeout_s=spec_gen_turn_timeout_s(),
            skip_workspace_init=True,
        )
        parsed = parse_generated_layers(raw, section=sec)
        merged = normalize_spec_layer_traceability(
            merge_generated_layers(item, parsed, section=sec)
        )
        ears_blocked = False
        ears_issues: list[dict] = []
        req_text = merged.get("requirements", "")
        if apply and any(merged.values()):
            ok, ears_issues = requirements_pass_ears(req_text)
            ears_gate = sec in ("all", "requirements")
            if enforce_ears and ears_gate and not ok:
                apply = False
                ears_blocked = True
            else:
                item, _ = api.update(
                    todo_id,
                    requirements=req_text,
                    design=merged.get("design", ""),
                    tasks_md=merged.get("tasks_md", ""),
                )
        return {
            "requirements": merged.get("requirements", ""),
            "design": merged.get("design", ""),
            "tasks_md": merged.get("tasks_md", ""),
            "raw": raw,
            "item": item,
            "ears_blocked": ears_blocked,
            "ears_issues": ears_issues,
            "section": sec,
        }
