"""
Headless cecli sessions for API / web frontends.
"""

from __future__ import annotations

import asyncio
import base64
import concurrent.futures
import os
import threading
import time
from contextlib import nullcontext
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
from bright_vision_core.spec_focus import (
    build_user_message_with_spec_context,
    spec_focus_requested,
)
from bright_vision_core.spec_layers import normalize_spec_layer_traceability
from bright_vision_core.roadmap_hints import maybe_append_roadmap_hint
from bright_vision_core.slash_helpers import (
    fast_slash_preproc_timeout_s,
    is_switch_coder_signal,
    resolve_slash_command_name,
    resolve_turn_slash_command,
    synthetic_slash_preproc_input,
    run_slash_command_sync,
    slash_preproc_timeout_s,
)
from bright_vision_core.workspace_paths import attachments_dir, attachments_prefix
from bright_vision_core.model_router import (
    ModelRouterConfig,
    RouteDecision,
    RouteTurnContext,
    classify_prompt,
    escalation_target,
    estimate_message_tokens,
    estimate_prompt_tokens,
    normalize_route_role,
    should_escalate_code_turn,
    should_escalate_fast_turn,
)
from bright_vision_core.model_router_apply import apply_route_to_coder
from bright_vision_core.llm_progress import llm_wait_messages
from bright_vision_core.workspace_todos import WorkspaceTodos


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
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> Iterator[dict[str, Any]]:
    """
    Yield pending IO events. Slash/preproc turns (e.g. ``/agent``) finish via
    ``generate()`` → ``ai_output`` → ``assistant_complete`` without ``token``
    events; optionally mirror that text to ``token`` for SSE/UI parity.
    """
    for event in io.drain_events():
        if on_event is not None:
            on_event(event)
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
    on_event: Callable[[dict[str, Any]], None] | None = None,
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
            on_event=on_event,
        )
    if error:
        yield from _drain_io_events(
            io,
            mirror_assistant_complete=mirror_assistant_complete,
            assistant_text=assistant_text,
            on_event=on_event,
        )
        raise error[0]
    yield from _drain_io_events(
        io,
        mirror_assistant_complete=mirror_assistant_complete,
        assistant_text=assistant_text,
        on_event=on_event,
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

    def sync_agent_todos_with_workspace(
        self,
        *,
        sanitize: "AgentTodoSanitizeContext | None" = None,
        prior_done_texts: frozenset[str] | None = None,
    ) -> list[str]:
        """Pull Cecli agent todo.txt into workspace Tasks before turn end."""
        try:
            from bright_vision_core.agent_todos import sync_session_agent_todos

            _store, warnings = sync_session_agent_todos(
                self,
                pull=True,
                push_active=True,
                sanitize=sanitize,
                prior_done_texts=prior_done_texts,
            )
            return warnings
        except Exception:
            import logging

            logging.getLogger(__name__).debug("agent todo sync skipped", exc_info=True)
            return []

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
        workspaces: dict[str, Any] | None = None,
        workspace_name: str | None = None,
    ) -> Session:
        workspace = Path(workspace_dir).resolve()
        if not workspace.is_dir():
            raise FileNotFoundError(f"Workspace not found: {workspace}")

        from bright_vision_core.workspace_config import ensure_workspaces_file

        ensure_workspaces_file(workspace, workspaces)

        from bright_vision_core.vision_runtime import configure_vision_runtime, purge_legacy_tag_caches

        configure_vision_runtime()
        purge_legacy_tag_caches(workspace)

        from bright_vision_core.litellm_extra_params import register_litellm_extra_params

        router_cfg_early = (
            ModelRouterConfig.from_payload(model_router)
            if isinstance(model_router, dict)
            else model_router
        )
        if router_cfg_early is None:
            router_cfg_early = ModelRouterConfig.from_env()
        register_litellm_extra_params(
            exclude_think=bool(router_cfg_early and router_cfg_early.enabled)
        )

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
            if main_model.is_ollama():
                main_model._ensure_extra_params_dict()
                keep_alive = -1
                if router_cfg and router_cfg.enabled:
                    keep_alive = router_cfg.keep_alive_heavy
                main_model.extra_params.setdefault("keep_alive", keep_alive)

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
            max_input = int(main_model.info.get("max_input_tokens") or 0)
            compaction_max = int(max_input * 0.65) if max_input > 0 else 65_536
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
                    enable_context_compaction=True,
                    context_compaction_max_tokens=compaction_max,
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
            "role": decision.role,
            "model": decision.model_name,
            "estimated_tokens": decision.estimated_tokens,
            "reasons": decision.reasons,
            "escalated": escalated,
            "enable_thinking": decision.enable_thinking,
        }
        if load_ms is not None:
            payload["load_ms"] = load_ms
        if swapped is not None:
            payload["swapped"] = swapped
        return self.io.emit("model_route", **payload)

    def _yield_model_route(
        self,
        decision: RouteDecision,
        *,
        escalated: bool = False,
    ) -> Iterator[dict[str, Any]]:
        """Emit one model_route SSE event (emit queues; do not also yield emit return)."""
        self._emit_model_route(decision, escalated=escalated)
        yield from self.io.drain_events()

    def _route_and_apply(
        self,
        user_message: str,
        *,
        intent_message: str | None = None,
        force_tier: str | None = None,
        turn: RouteTurnContext | None = None,
    ) -> RouteDecision | None:
        router = self._model_router
        if not router or not router.enabled:
            return None
        code = router.resolved_code_model or self._router_heavy_model_name
        routing_text = (intent_message if intent_message is not None else user_message).strip()
        message_tokens = estimate_message_tokens(routing_text)
        context_tokens = self._estimate_turn_tokens(user_message)
        tier_force = normalize_route_role(force_tier)
        decision = classify_prompt(
            routing_text,
            message_tokens=message_tokens,
            context_tokens=context_tokens,
            router=router,
            code_model_name=code,
            turn=turn,
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
        agent_continuation: bool = False,
        edit_failure_continuation: bool = False,
    ) -> Iterator[dict[str, Any]]:
        user_text = maybe_append_roadmap_hint(message, self.coder)
        focus_requested = spec_focus_requested(
            message_spec_focus=spec_focus,
            session_spec_focus=self.spec_focus,
            session_mode=self.session_mode,
        )
        item = None
        store = None
        todos_api: WorkspaceTodos | None = None
        if active_todo_id:
            todos_api = WorkspaceTodos(self.coder.root)
            store = todos_api.load()
            item = todos_api.find(store, active_todo_id)
            if item is not None:
                try:
                    item = todos_api.maybe_import_spec_from_disk(item)
                except ValueError:
                    pass
        from bright_vision_core.spec_focus import is_implement_turn_message

        agent_cmd = resolve_slash_command_name(message, self.coder.commands) == "agent"
        implement_turn = is_implement_turn_message(message)
        effective_force_tier = force_tier
        if agent_cmd and normalize_route_role(effective_force_tier) is None:
            effective_force_tier = "code"

        def _route_turn_context() -> RouteTurnContext:
            return RouteTurnContext(
                agent_cmd=agent_cmd,
                implement_turn=implement_turn,
                inject_todo_spec=inject_todo_spec,
                exploration_aborted=bool(turn_context_state.get("exploration_aborted")),
            )
        if hasattr(self.io, "set_chat_rel_files"):
            self.io.set_chat_rel_files(self.coder.get_inchat_relative_files())
        user_text, _spec_active, turn_todo_id = build_user_message_with_spec_context(
            self.coder.root,
            user_text,
            item=item,
            store=store,
            focus_requested=focus_requested,
            inject_todo_spec=inject_todo_spec,
            agent_continuation=agent_continuation,
        )

        self.io.emit("user_message", text=user_text)
        for event in self.io.drain_events():
            yield event
        assistant_text: list[str] = []
        turn_had_tool_activity = False
        turn_had_tool_call = False
        turn_context_state = {
            "warned": False,
            "cumulative": 0,
            "rounds": 0,
            "aborted": False,
            "readrange_errors": 0,
            "ls_calls": 0,
            "explore_calls": 0,
            "duplicate_tool_calls": 0,
            "exploration_aborted": False,
            "flutter_test_ok": None,
            "focus_step": None,
        }
        if item is not None:
            from bright_vision_core.spec_focus import is_implement_turn_message

            if is_implement_turn_message(message):
                from bright_vision_core.agent_todos import load_agent_todo_rows
                from bright_vision_core.implement_workspace import (
                    checklist_step_prefix,
                    resolve_implement_focus,
                )

                checklist = item.checklist or []
                agent_rows = load_agent_todo_rows(self.coder.root, item)
                focus, _from_agent = resolve_implement_focus(
                    checklist,
                    message=message,
                    active_task_title=item.title,
                    agent_todo_rows=agent_rows,
                )
                if focus is not None:
                    turn_context_state["focus_step"] = checklist_step_prefix(focus.text)

        def _track_tool_activity(event: dict[str, Any]) -> None:
            nonlocal turn_had_tool_activity, turn_had_tool_call
            from bright_vision_core.agent_turn import (
                AGENT_CONTEXT_PRESSURE_CUMULATIVE,
                agent_context_pressure_abort_warning,
                agent_context_pressure_warning,
                agent_had_write_tool_in_events,
                duplicate_tool_call_abort_warning,
                exploration_ls_abort_warning,
                exploration_repetition_abort_warning,
                is_agent_tool_activity_event,
                is_duplicate_tool_call_error_event,
                is_explore_code_tool_output_event,
                is_ls_tool_output_event,
                is_readrange_first_edit_error_event,
                is_readrange_tool_error_event,
                is_tool_activity_event,
                parse_token_usage_stat,
                readrange_failure_abort_warning,
                should_abort_agent_for_context_pressure,
                should_abort_turn_for_duplicate_tool_calls,
                should_abort_turn_for_ls_exploration,
                should_abort_turn_for_readrange_failures,
                should_abort_turn_for_repetition_guard,
            )

            if is_agent_tool_activity_event(event):
                turn_had_tool_call = True
            if is_tool_activity_event(event):
                turn_had_tool_activity = True
            if turn_context_state["aborted"]:
                return
            if event.get("type") == "tool_output":
                stat = parse_token_usage_stat(str(event.get("text") or ""))
                if stat:
                    turn_context_state["rounds"] += 1
                    cumulative = stat.get("cumulative", 0)
                    if cumulative:
                        turn_context_state["cumulative"] = max(
                            turn_context_state["cumulative"], cumulative
                        )
                    if (
                        agent_cmd
                        and not agent_continuation
                        and not turn_context_state["warned"]
                        and turn_context_state["cumulative"]
                        >= AGENT_CONTEXT_PRESSURE_CUMULATIVE
                    ):
                        turn_context_state["warned"] = True
                        self.io.tool_warning(
                            agent_context_pressure_warning(
                                cumulative=turn_context_state["cumulative"],
                                rounds=turn_context_state["rounds"],
                            )
                        )
            if (
                agent_cmd
                and not agent_continuation
                and event.get("type") == "tool_error"
                and is_readrange_first_edit_error_event(event)
                and should_abort_agent_for_context_pressure(
                    cumulative_tokens=turn_context_state["cumulative"],
                    edit_error_event=event,
                    agent_cmd=agent_cmd,
                    agent_continuation=agent_continuation,
                )
            ):
                turn_context_state["aborted"] = True
                turn_context_state["exploration_aborted"] = True
                self.io.tool_warning(
                    agent_context_pressure_abort_warning(
                        cumulative=turn_context_state["cumulative"],
                        rounds=turn_context_state["rounds"],
                    )
                )
                self.interrupt_turn()
            if event.get("type") == "tool_error" and is_readrange_tool_error_event(event):
                turn_context_state["readrange_errors"] += 1
                if (
                    not turn_context_state["aborted"]
                    and should_abort_turn_for_readrange_failures(
                        total_readrange_failures=turn_context_state["readrange_errors"],
                        edit_failure_continuation=edit_failure_continuation,
                    )
                ):
                    turn_context_state["aborted"] = True
                    turn_context_state["exploration_aborted"] = True
                    self.io.tool_warning(
                        readrange_failure_abort_warning(
                            total=turn_context_state["readrange_errors"],
                        )
                    )
                    self.interrupt_turn()
            if (
                event.get("type") == "tool_error"
                and is_duplicate_tool_call_error_event(event)
            ):
                turn_context_state["duplicate_tool_calls"] += 1
                if (
                    not turn_context_state["aborted"]
                    and should_abort_turn_for_duplicate_tool_calls(
                        total_duplicate_calls=turn_context_state["duplicate_tool_calls"],
                        edit_failure_continuation=edit_failure_continuation,
                        agent_continuation=agent_continuation,
                    )
                ):
                    turn_context_state["aborted"] = True
                    turn_context_state["exploration_aborted"] = True
                    self.io.tool_warning(
                        duplicate_tool_call_abort_warning(
                            total=turn_context_state["duplicate_tool_calls"],
                        )
                    )
                    self.interrupt_turn()
            if event.get("type") == "tool_output" and is_ls_tool_output_event(event):
                turn_context_state["ls_calls"] += 1
            if event.get("type") == "tool_output" and is_explore_code_tool_output_event(event):
                turn_context_state["explore_calls"] += 1
            if event.get("type") == "tool_output" and (
                is_ls_tool_output_event(event) or is_explore_code_tool_output_event(event)
            ):
                ring = list(getattr(self.io, "debug_event_ring", []) or [])
                if (
                    not turn_context_state["aborted"]
                    and should_abort_turn_for_ls_exploration(
                        total_ls_calls=turn_context_state["ls_calls"],
                        had_write=agent_had_write_tool_in_events(ring),
                        edit_failure_continuation=edit_failure_continuation,
                        agent_continuation=agent_continuation,
                        total_explore_calls=turn_context_state["explore_calls"],
                    )
                ):
                    turn_context_state["aborted"] = True
                    turn_context_state["exploration_aborted"] = True
                    self.io.tool_warning(
                        exploration_ls_abort_warning(total=turn_context_state["ls_calls"])
                    )
                    self.interrupt_turn()
            if not turn_context_state["aborted"] and is_agent_tool_activity_event(event):
                ring = list(getattr(self.io, "debug_event_ring", []) or [])
                if should_abort_turn_for_repetition_guard(
                    coder=self.coder,
                    events=ring,
                    edit_failure_continuation=edit_failure_continuation,
                    agent_continuation=agent_continuation,
                ):
                    turn_context_state["aborted"] = True
                    turn_context_state["exploration_aborted"] = True
                    self.io.tool_warning(exploration_repetition_abort_warning())
                    self.interrupt_turn()

        def _run_agent_continuation(continue_message: str, status: str) -> Iterator[dict[str, Any]]:
            if not agent_cmd or agent_continuation:
                return
            yield self.io.tool_output(status)
            for event in self.run_message(
                continue_message,
                preproc=True,
                skip_workspace_init=True,
                active_todo_id=turn_todo_id,
                inject_todo_spec=False,
                spec_focus=focus_requested,
                force_tier=effective_force_tier,
                agent_continuation=True,
            ):
                yield event

        def _run_edit_failure_continuation() -> Iterator[dict[str, Any]]:
            if edit_failure_continuation:
                return
            from bright_vision_core.agent_turn import edit_failure_continue_message

            yield self.io.tool_output(
                "EditText failed — auto-continuing once with ReadRange guidance…"
            )
            for event in self.run_message(
                edit_failure_continue_message(),
                preproc=False,
                skip_workspace_init=True,
                active_todo_id=turn_todo_id,
                inject_todo_spec=False,
                spec_focus=focus_requested,
                force_tier=effective_force_tier,
                edit_failure_continuation=True,
            ):
                yield event

        def _maybe_continue_agent_after_shell() -> Iterator[dict[str, Any]]:
            from bright_vision_core.agent_turn import agent_continue_after_shell_message

            yield from _run_agent_continuation(
                agent_continue_after_shell_message(),
                "Continuing /agent to analyze shell output…",
            )

        def _maybe_continue_agent_after_token_limit() -> Iterator[dict[str, Any]]:
            from bright_vision_core.agent_turn import agent_continue_after_token_limit_message

            yield from _run_agent_continuation(
                agent_continue_after_token_limit_message(),
                "Continuing /agent after token limit…",
            )

        def _maybe_continue_agent_after_stall() -> Iterator[dict[str, Any]]:
            from bright_vision_core.agent_turn import agent_continue_after_stall_message

            yield from _run_agent_continuation(
                agent_continue_after_stall_message(),
                "Continuing /agent after stalled exploration (empty model / repetition)…",
            )

        def _maybe_verify_implement_tests() -> Iterator[dict[str, Any]]:
            from bright_vision_core.agent_todos import load_agent_todo_rows
            from bright_vision_core.implement_workspace import (
                dart_test_paths_for_focus,
                edited_dart_test_files,
                is_test_related_checklist_text,
                resolve_implement_focus,
                run_flutter_tests,
            )
            from bright_vision_core.spec_focus import is_implement_turn_message

            if not is_implement_turn_message(message):
                return
            edited = _edited_files(self.coder)
            tests = edited_dart_test_files(edited)
            focus = None
            if item is not None:
                agent_rows = load_agent_todo_rows(self.coder.root, item)
                focus, _from_agent = resolve_implement_focus(
                    item.checklist or [],
                    message=message,
                    active_task_title=item.title,
                    agent_todo_rows=agent_rows,
                )
            if not tests and focus is not None and is_test_related_checklist_text(focus.text):
                tests = dart_test_paths_for_focus(self.coder.root, focus)
            if not tests:
                return
            ok, output = run_flutter_tests(self.coder.root, tests)
            turn_context_state["flutter_test_ok"] = ok
            header = "✅ flutter test passed" if ok else "❌ flutter test failed"
            yield self.io.tool_output(f"{header} ({', '.join(tests)}):\n{output}")
            if ok:
                yield self.io.tool_warning(
                    "Tests passed — mark the checklist item **done** in Tasks if this step is complete."
                )
            else:
                yield self.io.tool_warning(
                    "Fix failing tests with **ReadRange** + **EditText** on one file — "
                    "do not ls, resume, or mark test tasks done in UpdateTodoList."
                )

        def _maybe_warn_agent_shell_stop() -> Iterator[dict[str, Any]]:
            if not agent_cmd or agent_continuation:
                return
            from bright_vision_core.agent_turn import (
                agent_stopped_after_shell_warning,
                is_agent_shell_only_stop,
            )

            if is_agent_shell_only_stop(
                had_tool_activity=turn_had_tool_activity,
                had_tool_call=turn_had_tool_call,
            ):
                yield self.io.tool_warning(agent_stopped_after_shell_warning())

        def _maybe_warn_incomplete_agent() -> Iterator[dict[str, Any]]:
            if not agent_cmd:
                return
            from bright_vision_core.agent_turn import (
                empty_agent_turn_warning,
                incomplete_agent_warning,
            )

            blob = _assistant_text_blob()
            msg = empty_agent_turn_warning(
                had_tool_activity=turn_had_tool_activity,
                assistant_text=blob,
            )
            if msg:
                yield self.io.tool_warning(msg)
                return
            msg = incomplete_agent_warning(
                blob,
                had_tool_activity=turn_had_tool_activity,
            )
            if msg:
                yield self.io.tool_warning(msg)

        def _assistant_text_blob() -> str:
            blob = "".join(assistant_text).strip()
            if blob:
                return blob
            ring = getattr(self.io, "debug_event_ring", None)
            if ring is not None:
                for event in reversed(ring):
                    if event.get("type") == "assistant_complete":
                        text = str(event.get("text") or "").strip()
                        if text:
                            return text
            return blob

        def _maybe_recover_prose_shell() -> Iterator[dict[str, Any]]:
            nonlocal turn_had_tool_activity
            if not agent_cmd:
                return
            from bright_vision_core.agent_turn import (
                extract_prose_shell_commands,
                prose_shell_in_text,
                run_prose_shell_recovery,
                shell_output_in_events,
            )

            ring = list(getattr(self.io, "debug_event_ring", []) or [])
            if shell_output_in_events(ring):
                return
            blob = _assistant_text_blob()
            if not prose_shell_in_text(blob):
                return
            workspace = Path(self.coder.root).resolve()
            for command in extract_prose_shell_commands(blob):
                output = run_prose_shell_recovery(workspace, command)
                if output is None:
                    continue
                turn_had_tool_activity = True
                block = f"$ {command}\n{output}"
                assistant_text.append(f"\n\n{block}")
                yield self.io.tool_output(f"Recovered prose shell (read-only):\n{block}")
                return

        def _finalize_agent_preproc_turn() -> Iterator[dict[str, Any]]:
            yield from _drain_io_events(
                self.io,
                mirror_assistant_complete=True,
                assistant_text=assistant_text,
                on_event=_track_tool_activity,
            )
            yield from _maybe_recover_prose_shell()
            from bright_vision_core.agent_turn import (
                agent_context_dead_end_in_events,
                agent_context_dead_end_warning,
                agent_stall_recovery_warning,
                agent_token_limit_recovery_warning,
                agent_turn_stalled,
                empty_local_llm_response_in_events,
                empty_ollama_auto_continue_blocked_warning,
                empty_ollama_exploration_blocked_warning,
                empty_ollama_exploration_exhausted,
                is_agent_shell_only_stop,
                should_auto_continue_after_agent_stall,
                should_auto_continue_after_shell,
                should_auto_continue_after_token_limit,
                spurious_ollama_token_limit_in_events,
                spurious_ollama_token_limit_warning,
                token_limit_exhausted,
            )

            ring = list(getattr(self.io, "debug_event_ring", []) or [])
            blob = _assistant_text_blob()
            model_ctx = int(self.coder.main_model.info.get("max_input_tokens") or 0) or None
            context_dead_end = agent_context_dead_end_in_events(
                ring, model_context_tokens=model_ctx
            )
            if not agent_continuation and not turn_context_state["exploration_aborted"]:
                if should_auto_continue_after_shell(
                    had_tool_activity=turn_had_tool_activity,
                    had_tool_call=turn_had_tool_call,
                    events=ring,
                ):
                    yield from _maybe_continue_agent_after_shell()
                    return
                if should_auto_continue_after_token_limit(events=ring, assistant_text=blob):
                    yield from _maybe_continue_agent_after_token_limit()
                    return
                if should_auto_continue_after_agent_stall(
                    had_tool_call=turn_had_tool_call,
                    events=ring,
                    assistant_text=blob,
                    coder=self.coder,
                    model_context_tokens=model_ctx,
                ):
                    yield from _maybe_continue_agent_after_stall()
                    return
                if (
                    is_agent_shell_only_stop(
                        had_tool_activity=turn_had_tool_activity,
                        had_tool_call=turn_had_tool_call,
                    )
                    and empty_local_llm_response_in_events(ring)
                ):
                    yield self.io.tool_warning(empty_ollama_auto_continue_blocked_warning())
                elif token_limit_exhausted(events=ring, assistant_text=blob):
                    if spurious_ollama_token_limit_in_events(ring):
                        yield self.io.tool_warning(spurious_ollama_token_limit_warning())
                    else:
                        yield self.io.tool_warning(
                            agent_token_limit_recovery_warning(auto_continue_attempted=False)
                        )
                elif empty_ollama_exploration_exhausted(ring):
                    yield self.io.tool_warning(empty_ollama_exploration_blocked_warning())
                elif turn_context_state.get("exploration_aborted"):
                    pass  # warning already emitted during the turn
                elif agent_turn_stalled(
                    had_tool_call=turn_had_tool_call,
                    events=ring,
                    coder=self.coder,
                ):
                    if context_dead_end:
                        yield self.io.tool_warning(
                            agent_context_dead_end_warning(
                                events=ring,
                                auto_continue_attempted=False,
                                model_context_tokens=model_ctx,
                            )
                        )
                    else:
                        yield self.io.tool_warning(
                            agent_stall_recovery_warning(auto_continue_attempted=False)
                        )
            elif token_limit_exhausted(events=ring, assistant_text=blob):
                yield self.io.tool_warning(
                    agent_token_limit_recovery_warning(auto_continue_attempted=True)
                )
            elif turn_context_state.get("exploration_aborted"):
                pass
            elif agent_turn_stalled(
                had_tool_call=turn_had_tool_call,
                events=ring,
                coder=self.coder,
            ):
                if context_dead_end:
                    yield self.io.tool_warning(
                        agent_context_dead_end_warning(
                            events=ring,
                            auto_continue_attempted=True,
                            model_context_tokens=model_ctx,
                        )
                    )
                else:
                    yield self.io.tool_warning(
                        agent_stall_recovery_warning(auto_continue_attempted=True)
                    )
            yield from _maybe_warn_incomplete_agent()
            yield from _maybe_warn_agent_shell_stop()
            yield from _maybe_verify_implement_tests()
            ring = list(getattr(self.io, "debug_event_ring", []) or [])
            from bright_vision_core.agent_turn import (
                agent_ran_flutter_via_shell,
                edit_failure_turn_warning,
                flutter_test_shell_blocked_warning,
            )
            from bright_vision_core.spec_focus import is_implement_turn_message

            if is_implement_turn_message(message) and agent_ran_flutter_via_shell(ring):
                yield self.io.tool_warning(flutter_test_shell_blocked_warning())

            msg = edit_failure_turn_warning(events=ring, edited_files=_edited_files(self.coder))
            if msg:
                yield self.io.tool_warning(msg)

            from bright_vision_core.agent_todos import AgentTodoSanitizeContext

            prior_done = (
                frozenset(entry.text for entry in item.checklist if entry.done)
                if item is not None and item.checklist
                else frozenset()
            )
            sanitize = None
            if is_implement_turn_message(message) and (
                turn_context_state.get("focus_step") or turn_context_state.get("flutter_test_ok") is not None
            ):
                sanitize = AgentTodoSanitizeContext(
                    focus_step=turn_context_state.get("focus_step"),
                    flutter_test_ok=turn_context_state.get("flutter_test_ok"),
                )
            for warning in self.sync_agent_todos_with_workspace(
                sanitize=sanitize,
                prior_done_texts=prior_done,
            ):
                yield self.io.tool_warning(warning)
            yield self.io.emit(
                "done",
                **_attach_turn_capture({"assistant_text": "".join(assistant_text) or _assistant_text_blob()}),
            )

        self.coder.interrupt_event.clear()

        from bright_vision_core.turn_metrics import TurnMetricsCollector

        turn_metrics = TurnMetricsCollector()
        turn_metrics.start()

        def _attach_turn_capture(payload: dict[str, Any]) -> dict[str, Any]:
            cap = turn_metrics.stop()
            if cap is not None:
                payload = {**payload, "turn_capture": cap.to_dict()}
            return payload

        try:
            if not skip_workspace_init:
                emit_progress(self.io, label="Vision", message="Preparing workspace…")
                yield from _drain_io_events(self.io)

                for pulse_event in _run_blocking_with_sse_pulses(
                    self.io,
                    self.coder.init_before_message,
                    label="Vision",
                    message="Preparing workspace",
                ):
                    if isinstance(pulse_event, dict):
                        yield pulse_event
            self.io.user_input(user_text)

            user_msg = user_text
            agent_preproc_prior_yes = getattr(self.io, "yes", None)
            agent_preproc_prior_yes_always = getattr(self.coder.args, "yes_always_commands", False)

            def _restore_agent_preproc_io() -> None:
                if not agent_cmd:
                    return
                self.io._agent_mode_active = False
                self.io.yes = agent_preproc_prior_yes
                self.coder.args.yes_always_commands = agent_preproc_prior_yes_always

            if preproc:
                if (
                    agent_cmd
                    and self._model_router
                    and self._model_router.enabled
                    and normalize_route_role(effective_force_tier) != "fast"
                ):
                    pre_route = self._route_and_apply(
                        message,
                        intent_message=message,
                        force_tier="code",
                        turn=_route_turn_context(),
                    )
                    if pre_route:
                        yield from self._yield_model_route(pre_route)
                emit_progress(self.io, label="Vision", message="Running slash commands…")
                yield from _drain_io_events(self.io)

                def _preproc() -> str | None:
                    rebind_coder_loop_primitives(self.coder)

                    async def _preproc_coro():
                        preproc_inp = synthetic_slash_preproc_input(
                            message, user_text, self.coder.commands
                        )
                        target = preproc_inp if preproc_inp is not None else user_text
                        return await self.coder.preproc_user_input(target)

                    return run(_preproc_coro())

                preproc_timeout = slash_preproc_timeout_s(
                    user_text,
                    self.coder.commands,
                    message=message,
                    agent_cmd=agent_cmd,
                )
                agent_confirm = getattr(self.io, "agent_auto_confirm", None)
                preproc_switch_err: BaseException | None = None

                if agent_cmd:
                    self.io.yes = True
                    self.coder.args.yes_always_commands = True
                    self.io._agent_mode_active = True
                    if hasattr(self.io, "set_chat_rel_files"):
                        self.io.set_chat_rel_files(self.coder.get_inchat_relative_files())
                try:
                    confirm_ctx = agent_confirm() if agent_cmd and agent_confirm else nullcontext()
                    with confirm_ctx:
                        for preproc_result in _run_blocking_with_sse_pulses(
                            self.io,
                            _preproc,
                            label="Vision",
                            message="Running slash commands",
                            mirror_assistant_complete=True,
                            assistant_text=assistant_text,
                            timeout_s=preproc_timeout,
                            on_timeout=self.interrupt_turn if preproc_timeout else None,
                            on_event=_track_tool_activity,
                        ):
                            if isinstance(preproc_result, dict):
                                yield preproc_result
                                if turn_context_state["aborted"]:
                                    break
                            else:
                                user_msg = preproc_result
                except TimeoutError as err:
                    _restore_agent_preproc_io()
                    yield from _drain_io_events(
                        self.io,
                        mirror_assistant_complete=True,
                        assistant_text=assistant_text,
                        on_event=_track_tool_activity,
                    )
                    cmd = resolve_turn_slash_command(
                        user_text,
                        self.coder.commands,
                        message=message,
                        agent_cmd=agent_cmd,
                    )
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
                        **_attach_turn_capture(
                            {
                                "assistant_text": "".join(assistant_text),
                                "error": True,
                            }
                        ),
                    )
                    return
                except BaseException as preproc_err:
                    if is_switch_coder_signal(preproc_err):
                        preproc_switch_err = preproc_err
                    else:
                        _restore_agent_preproc_io()
                        raise

                if preproc_switch_err is not None:
                    yield from _finalize_agent_preproc_turn()
                    _restore_agent_preproc_io()
                    return

                if turn_context_state["aborted"]:
                    yield from _drain_io_events(
                        self.io,
                        mirror_assistant_complete=True,
                        assistant_text=assistant_text,
                        on_event=_track_tool_activity,
                    )
                    yield from _finalize_agent_preproc_turn()
                    _restore_agent_preproc_io()
                    return

            if user_msg is None or agent_cmd:
                yield from _finalize_agent_preproc_turn()
                _restore_agent_preproc_io()
                return

            for event in self.io.drain_events():
                yield event

            route_decision: RouteDecision | None = None
            if escalate_from_last and self._model_router and self._model_router.enabled:
                escalate_tier = escalation_target(self._last_route)
                route_decision = self._route_and_apply(
                    user_msg,
                    intent_message=message,
                    force_tier=escalate_tier,
                    turn=_route_turn_context(),
                )
                if route_decision:
                    yield from self._yield_model_route(route_decision, escalated=True)
            elif self._model_router and self._model_router.enabled:
                route_decision = self._route_and_apply(
                    user_msg,
                    intent_message=message,
                    force_tier=effective_force_tier,
                    turn=_route_turn_context(),
                )
                if route_decision:
                    yield from self._yield_model_route(route_decision)

            turn_had_tool_error = False
            turn_tool_error_text = ""
            consecutive_edit_failures = 0
            total_edit_failures = 0
            total_readrange_failures = 0
            edit_failure_aborted = False
            max_attempts = 1
            if self._model_router and self._model_router.escalate_on_failure:
                max_attempts = 2
                if self._model_router.resolved_think_model:
                    max_attempts = 3

            def _yield_turn_event(event: dict[str, Any]) -> Iterator[dict[str, Any]]:
                nonlocal turn_had_tool_error, turn_tool_error_text
                nonlocal consecutive_edit_failures, total_edit_failures, edit_failure_aborted
                nonlocal total_readrange_failures
                from bright_vision_core.agent_turn import (
                    edit_failure_abort_warning,
                    is_edit_tool_error_event,
                    is_edit_tool_success_event,
                    is_read_range_success_event,
                    is_readrange_tool_error_event,
                    readrange_failure_abort_warning,
                    should_abort_turn_for_edit_failures,
                    should_abort_turn_for_readrange_failures,
                )

                if event.get("type") == "tool_error":
                    turn_had_tool_error = True
                    turn_tool_error_text += str(event.get("text") or "")
                    if is_edit_tool_error_event(event):
                        consecutive_edit_failures += 1
                        total_edit_failures += 1
                    elif is_readrange_tool_error_event(event):
                        total_readrange_failures += 1
                elif is_edit_tool_success_event(event) or is_read_range_success_event(event):
                    consecutive_edit_failures = 0
                yield event
                if edit_failure_aborted:
                    return
                if should_abort_turn_for_readrange_failures(
                    total_readrange_failures=total_readrange_failures,
                    edit_failure_continuation=edit_failure_continuation,
                ):
                    edit_failure_aborted = True
                    yield self.io.tool_warning(
                        readrange_failure_abort_warning(total=total_readrange_failures)
                    )
                    self.interrupt_turn()
                    return
                if should_abort_turn_for_edit_failures(
                    consecutive_edit_failures=consecutive_edit_failures,
                    total_edit_failures=total_edit_failures,
                    agent_cmd=agent_cmd,
                    edit_failure_continuation=edit_failure_continuation,
                ):
                    edit_failure_aborted = True
                    yield self.io.tool_warning(
                        edit_failure_abort_warning(
                            consecutive=consecutive_edit_failures,
                            total=total_edit_failures,
                        )
                    )
                    self.interrupt_turn()

            for attempt in range(max_attempts):
                if attempt > 0 and route_decision:
                    route_decision = self._route_and_apply(
                        user_msg,
                        intent_message=message,
                        force_tier=escalation_target(route_decision),
                        turn=_route_turn_context(),
                    )
                    yield from self._yield_model_route(route_decision, escalated=True)

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
                        yield from _yield_turn_event(event)
                        if edit_failure_aborted:
                            break
                    if edit_failure_aborted:
                        break
                    if piece is HEARTBEAT_PULSE:
                        continue
                    if piece:
                        attempt_text.append(piece)
                        assistant_text.append(piece)
                        yield self.io.emit("token", text=piece)

                for event in self.io.drain_events():
                    yield from _yield_turn_event(event)
                    if edit_failure_aborted:
                        break

                if edit_failure_aborted:
                    break

                edited = _edited_files(self.coder)
                if (
                    attempt == 0
                    and route_decision
                    and self._model_router
                    and should_escalate_fast_turn(
                        route_decision,
                        router=self._model_router,
                        user_message=message,
                        edited_files=edited,
                        assistant_text="".join(attempt_text),
                        had_tool_error=turn_had_tool_error,
                        tool_error_text=turn_tool_error_text,
                    )
                ):
                    assistant_text.clear()
                    continue
                if (
                    attempt == 0
                    and route_decision
                    and self._model_router
                    and should_escalate_code_turn(
                        route_decision,
                        router=self._model_router,
                        user_message=message,
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
                todos_api = WorkspaceTodos(self.coder.root)
                todos_api.append_links(links, todo_id=turn_todo_id)
                if edited:
                    from bright_vision_core.workspace_files import edited_spec_layers_for_todo

                    if edited_spec_layers_for_todo(edited, turn_todo_id):
                        try:
                            todos_api.import_spec_files(turn_todo_id)
                        except ValueError:
                            pass

            self.sync_agent_todos_with_workspace()
            from bright_vision_core.agent_turn import (
                edit_failure_turn_warning,
                should_auto_continue_after_edit_failure,
                token_limit_exhausted,
                vibe_token_limit_recovery_warning,
            )

            ring = list(getattr(self.io, "debug_event_ring", []) or [])
            msg = edit_failure_turn_warning(events=ring, edited_files=edited)
            if msg:
                yield self.io.tool_warning(msg)
            if should_auto_continue_after_edit_failure(
                events=ring,
                agent_cmd=agent_cmd,
                edit_failure_continuation=edit_failure_continuation,
            ):
                yield from _run_edit_failure_continuation()
                return
            if token_limit_exhausted(
                events=ring,
                assistant_text="".join(assistant_text),
            ):
                yield self.io.tool_warning(vibe_token_limit_recovery_warning())
            yield from _maybe_verify_implement_tests()
            yield self.io.emit("done", **_attach_turn_capture(payload))
        except BaseException as err:
            if is_switch_coder_signal(err):
                yield from _finalize_agent_preproc_turn()
                return
            if isinstance(err, (KeyboardInterrupt, asyncio.CancelledError)):
                yield from _drain_io_events(
                    self.io,
                    mirror_assistant_complete=True,
                    assistant_text=assistant_text,
                )
                self.sync_agent_todos_with_workspace()
                yield self.io.emit(
                    "done",
                    **_attach_turn_capture(
                        {
                            "assistant_text": "".join(assistant_text),
                            "cancelled": True,
                        }
                    ),
                )
                return
            if isinstance(err, BrokenPipeError):
                yield self.io.emit("error", text=str(err))
                self.sync_agent_todos_with_workspace()
                yield self.io.emit(
                    "done",
                    **_attach_turn_capture(
                        {"assistant_text": "".join(assistant_text), "error": True}
                    ),
                )
                return
            if isinstance(err, Exception):
                yield self.io.emit("error", text=str(err))
                self.sync_agent_todos_with_workspace()
                yield self.io.emit(
                    "done",
                    **_attach_turn_capture(
                        {"assistant_text": "".join(assistant_text), "error": True}
                    ),
                )
                return
            raise

    def _expand_workspace_paths(self, paths: list[str], *, max_files: int = 400) -> list[str]:
        """Expand directory paths to workspace-relative files (for folder add-to-context)."""
        workspace = Path(self.coder.root).resolve()
        expanded: list[str] = []
        for raw in paths:
            p = Path(raw.strip().lstrip("@"))
            if not p.is_absolute():
                p = workspace / p
            p = p.resolve()
            if p.is_dir():
                count = 0
                for f in sorted(p.rglob("*")):
                    if not f.is_file():
                        continue
                    try:
                        rel = f.relative_to(workspace).as_posix()
                    except ValueError:
                        continue
                    repo = self.coder.repo
                    if repo is not None and repo.ignored_file(rel):
                        continue
                    expanded.append(rel)
                    count += 1
                    if count >= max_files:
                        self.io.tool_warning(
                            f"Folder {raw}: added first {max_files} files (cap reached)"
                        )
                        break
                if count == 0:
                    self.io.tool_error(f"No files in folder: {p}")
            else:
                expanded.append(raw)
        return expanded

    def _resolve_workspace_file(self, raw: str) -> str | None:
        """Return workspace-relative posix path for an on-disk file, or None after tool_error."""
        workspace = Path(self.coder.root).resolve()
        p = Path(raw.strip().lstrip("@"))
        if not p.is_absolute():
            p = workspace / p
        p = p.resolve()
        if not p.is_file():
            from bright_vision_core.workspace_files import workspace_relative_posix

            try:
                display = workspace_relative_posix(p, workspace)
            except ValueError:
                display = str(p)
            self.io.tool_error(
                f"Not on disk: {display} — create the file first or add an existing "
                "path to context."
            )
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

        paths = self._expand_workspace_paths(paths)

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
            # Let the worker unwind after interrupt (reduces pending asyncio task warnings).
            try:
                fut.result(timeout=15)
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
        turn_timeout_s: float | None = None,
    ) -> dict[str, Any]:
        from bright_vision_core.todo_spec_generate import (
            SpecSection,
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
        from bright_vision_core.spec_gen_agent import run_spec_layer_llm
        from bright_vision_core.todo_spec_jobs import spec_gen_turn_timeout_s

        turn_timeout = (
            float(turn_timeout_s)
            if turn_timeout_s is not None and turn_timeout_s > 0
            else spec_gen_turn_timeout_s()
        )
        raw = run_spec_layer_llm(
            self,
            workspace=str(self.coder.root),
            prompt=prompt,
            item=item,
            section=sec,  # type: ignore[arg-type]
            mode=mode,
            todo_id=todo_id,
            total_turn_timeout_s=turn_timeout,
        )
        parsed = parse_generated_layers(raw, section=sec)
        merged = normalize_spec_layer_traceability(
            merge_generated_layers(item, parsed, section=sec)
        )
        ears_blocked = False
        ears_issues: list[dict] = []
        req_text = merged.get("requirements", "")
        if req_text.strip() and enforce_ears and sec in ("all", "requirements"):
            from bright_vision_core.ears.repair import repair_requirements_missing_shall
            from bright_vision_core.todo_spec_generate import compact_spec_gen_enabled

            if compact_spec_gen_enabled():
                req_text = repair_requirements_missing_shall(req_text)
                merged = {**merged, "requirements": req_text}
        target_layer = {
            "requirements": "requirements",
            "design": "design",
            "tasks_md": "tasks_md",
        }.get(sec)
        if target_layer and not (merged.get(target_layer) or "").strip():
            raise ValueError(
                f"Spec generation produced no {target_layer.replace('_', ' ')} content — "
                "retry with a narrower prompt or export the job debug bundle."
            )
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
