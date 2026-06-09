"""Tests for incomplete /agent turn detection."""

from pathlib import Path

from bright_vision_core.agent_turn import (
    extract_prose_shell_commands,
    incomplete_agent_warning,
    is_safe_readonly_shell,
    is_tool_activity_event,
    run_prose_shell_recovery,
)


def test_is_tool_activity_event_tool_call():
    assert is_tool_activity_event({"type": "tool_call", "text": "shell find ."})


def test_is_tool_activity_event_tool_output():
    assert is_tool_activity_event({"type": "tool_output", "text": "Cargo.toml\n"})


def test_is_tool_activity_event_ignores_empty_and_token_stats():
    assert not is_tool_activity_event({"type": "tool_output", "text": ""})
    assert not is_tool_activity_event({"type": "tool_output", "text": "41k ↑ 181 ↓"})
    assert not is_tool_activity_event({"type": "token", "text": "hello"})


def test_extract_prose_shell_commands():
    text = (
        "Explore.\n\n"
        "```bash\nfind . -name \"Cargo.toml\" | head -30\n```"
    )
    assert extract_prose_shell_commands(text) == [
        'find . -name "Cargo.toml" | head -30',
    ]


def test_is_safe_readonly_shell_blocks_destructive():
    assert is_safe_readonly_shell("find . -name Cargo.toml")
    assert not is_safe_readonly_shell("rm -rf .")
    assert not is_safe_readonly_shell("curl http://evil")


def test_is_safe_readonly_shell_allows_find_pipe_head_and_curl_reference_path():
    cmd = (
        'find . -name "Cargo.toml" -not -path "./vendor/*" '
        '-not -path "./curl-reference-code/*" | head -30'
    )
    assert is_safe_readonly_shell(cmd)


def test_run_prose_shell_recovery_find(tmp_path: Path):
    (tmp_path / "Cargo.toml").write_text("[package]\nname = \"x\"\n", encoding="utf-8")
    out = run_prose_shell_recovery(tmp_path, 'find . -name "Cargo.toml"')
    assert out is not None
    assert "Cargo.toml" in out


def test_incomplete_agent_warning_prose_shell_without_tools():
    text = (
        "I'll explore the repo.\n\n"
        "```bash\nfind . -maxdepth 2 -name \"Cargo.toml\" | head -30\n```\n"
    )
    msg = incomplete_agent_warning(text, had_tool_activity=False)
    assert msg is not None
    assert "without running tools" in msg


def test_incomplete_agent_warning_suppressed_when_tools_ran():
    text = "```bash\nls\n```"
    assert incomplete_agent_warning(text, had_tool_activity=True) is None


def test_incomplete_agent_warning_suppressed_without_shell_fence():
    assert incomplete_agent_warning("I'll list files next.", had_tool_activity=False) is None


def test_is_agent_shell_only_stop():
    from bright_vision_core.agent_turn import is_agent_shell_only_stop

    assert is_agent_shell_only_stop(had_tool_activity=True, had_tool_call=False)
    assert not is_agent_shell_only_stop(had_tool_activity=True, had_tool_call=True)
    assert not is_agent_shell_only_stop(had_tool_activity=False, had_tool_call=False)


def test_is_agent_tool_output_text():
    from bright_vision_core.agent_turn import (
        is_agent_tool_activity_event,
        is_agent_tool_output_text,
    )

    assert is_agent_tool_output_text("Tool Call: Local • ls")
    assert not is_agent_tool_output_text("Tool Call: server • x")
    assert not is_agent_tool_output_text("Running find .")
    assert is_agent_tool_activity_event(
        {"type": "tool_output", "text": "Tool Call: Local • Grep"}
    )


def test_should_auto_continue_after_shell():
    from bright_vision_core.agent_turn import should_auto_continue_after_shell

    shell_only = [{"type": "tool_output", "text": "Running find ."}]
    assert should_auto_continue_after_shell(
        had_tool_activity=True, had_tool_call=False, events=shell_only
    )
    agent_tools = [{"type": "tool_output", "text": "Tool Call: Local • ls"}]
    assert not should_auto_continue_after_shell(
        had_tool_activity=True, had_tool_call=True, events=agent_tools
    )
    empty_ollama = [
        {"type": "tool_output", "text": "Running find ."},
        {
            "type": "tool_warning",
            "text": "Empty response from the local model (Ollama). The model may have timed out.",
        },
    ]
    assert not should_auto_continue_after_shell(
        had_tool_activity=True, had_tool_call=False, events=empty_ollama
    )


def test_token_limit_detection_and_auto_continue():
    from bright_vision_core.agent_turn import (
        should_auto_continue_after_token_limit,
        spurious_ollama_token_limit_in_events,
        token_limit_exhausted_in_events,
        token_limit_exhausted_in_text,
    )

    events = [{"type": "tool_error", "text": "Model foo has hit a token limit!\n"}]
    assert token_limit_exhausted_in_events(events)
    assert not token_limit_exhausted_in_events([{"type": "tool_error", "text": "other"}])
    assert token_limit_exhausted_in_text("FinishReasonLength exception: you sent too many tokens")
    assert should_auto_continue_after_token_limit(
        events=events,
        assistant_text="partial output",
    )
    assert not should_auto_continue_after_token_limit(events=[], assistant_text="ok")

    spurious = [
        {
            "type": "tool_error",
            "text": (
                "Model ollama_chat/qwen has hit a token limit!\n"
                "Input tokens: ~6,025 of 262,144\n"
                "Output tokens: ~0 of 262,144\n"
            ),
        }
    ]
    assert spurious_ollama_token_limit_in_events(spurious)
    assert not should_auto_continue_after_token_limit(
        events=spurious,
        assistant_text="FinishReasonLength exception: you sent too many tokens",
    )


def test_agent_stall_detection_and_auto_continue():
    from bright_vision_core.agent_turn import (
        agent_context_dead_end_in_events,
        agent_context_dead_end_warning,
        agent_had_write_tool_in_events,
        agent_turn_stalled,
        parse_token_usage_stat,
        should_auto_continue_after_agent_stall,
        token_usage_stats_from_events,
    )

    explore_only = [
        {"type": "tool_output", "text": "Tool Call: Local • ls"},
        {"type": "tool_output", "text": "Found 2 files: .cecli/chat.history, .cecli/todos.json"},
        {
            "type": "tool_warning",
            "text": "Empty response from the local model (Ollama). The model may have timed out.",
        },
    ]
    assert agent_turn_stalled(had_tool_call=True, events=explore_only, coder=None)
    assert should_auto_continue_after_agent_stall(
        had_tool_call=True,
        events=explore_only,
        assistant_text="I'll explore the project.",
        coder=None,
    )
    assert not should_auto_continue_after_agent_stall(
        had_tool_call=False,
        events=explore_only,
        assistant_text="",
        coder=None,
    )
    wrote = explore_only + [
        {"type": "tool_output", "text": "Successfully executed EditText."},
    ]
    assert agent_had_write_tool_in_events(wrote)
    # Empty Ollama still counts as stalled (partial progress — continue to finish).
    assert agent_turn_stalled(had_tool_call=True, events=wrote, coder=None)

    assert parse_token_usage_stat("14k ↑ 54 ↓ 306k ↑↓") == {
        "input": 14_000,
        "output": 54,
        "cumulative": 306_000,
    }
    long_turn = [
        *[
            {"type": "tool_output", "text": f"{8 + i // 3}k ↑ 100 ↓ {80 + i * 8}k ↑↓"}
            for i in range(16)
        ],
        {
            "type": "tool_warning",
            "text": "Empty response from the local model (Ollama). The model may have timed out.",
        },
    ]
    assert len(token_usage_stats_from_events(long_turn)) == 16
    assert agent_context_dead_end_in_events(long_turn)
    assert not should_auto_continue_after_agent_stall(
        had_tool_call=True,
        events=long_turn,
        assistant_text="",
        coder=None,
    )
    msg = agent_context_dead_end_warning(
        events=long_turn,
        auto_continue_attempted=True,
    )
    assert "context dead end" in msg
    assert "Implement" in msg


def test_agent_context_pressure_and_abort():
    from bright_vision_core.agent_turn import (
        AGENT_CONTEXT_ABORT_CUMULATIVE,
        AGENT_CONTEXT_PRESSURE_CUMULATIVE,
        agent_context_dead_end_in_events,
        agent_context_pressure_abort_warning,
        agent_context_pressure_warning,
        agent_turn_context_overloaded,
        is_readrange_first_edit_error_event,
        should_abort_agent_for_context_pressure,
        should_auto_continue_after_agent_stall,
    )

    err = {
        "type": "tool_error",
        "text": "Error in EditText: Please call `ReadRange` first to make sure edits are appropriately scoped",
    }
    assert is_readrange_first_edit_error_event(err)
    assert not is_readrange_first_edit_error_event({"type": "tool_error", "text": "other"})

    stats_events = [
        {"type": "tool_output", "text": f"14k ↑ 54 ↓ {AGENT_CONTEXT_ABORT_CUMULATIVE // 1000}k ↑↓"}
    ]
    msg = agent_context_pressure_warning(
        cumulative=AGENT_CONTEXT_PRESSURE_CUMULATIVE,
        rounds=20,
    )
    assert "context pressure" in msg

    assert should_abort_agent_for_context_pressure(
        cumulative_tokens=AGENT_CONTEXT_ABORT_CUMULATIVE,
        edit_error_event=err,
        agent_cmd=True,
        agent_continuation=False,
    )
    assert not should_abort_agent_for_context_pressure(
        cumulative_tokens=AGENT_CONTEXT_ABORT_CUMULATIVE - 1,
        edit_error_event=err,
        agent_cmd=True,
        agent_continuation=False,
    )

    overloaded = stats_events + [err]
    assert agent_turn_context_overloaded(overloaded)
    assert agent_context_dead_end_in_events(overloaded)
    assert not should_auto_continue_after_agent_stall(
        had_tool_call=True,
        events=overloaded,
        assistant_text="",
        coder=None,
    )
    abort_msg = agent_context_pressure_abort_warning(
        cumulative=AGENT_CONTEXT_ABORT_CUMULATIVE,
        rounds=22,
    )
    assert "Stopped /agent" in abort_msg
    assert "Implement" in abort_msg
    from bright_vision_core.agent_turn import empty_agent_turn_warning

    msg = empty_agent_turn_warning(had_tool_activity=False, assistant_text="")
    assert msg is not None
    assert "/agent finished immediately" in msg
    assert empty_agent_turn_warning(had_tool_activity=True, assistant_text="") is None
    assert empty_agent_turn_warning(had_tool_activity=False, assistant_text="hi") is None


def test_empty_ollama_exploration_blocks_auto_continue():
    from bright_vision_core.agent_turn import (
        empty_ollama_exploration_exhausted,
        empty_ollama_exploration_blocked_warning,
        should_auto_continue_after_agent_stall,
    )

    exhausted = [
        *[
            {"type": "tool_output", "text": f"{8 + i}k ↑ 100 ↓ {20 + i * 10}k ↑↓"}
            for i in range(4)
        ],
        {
            "type": "tool_warning",
            "text": "Empty response from the local model (Ollama). The model may have timed out.",
        },
    ]
    assert empty_ollama_exploration_exhausted(exhausted)
    assert not should_auto_continue_after_agent_stall(
        had_tool_call=True,
        events=exhausted,
        assistant_text="",
        coder=None,
    )
    msg = empty_ollama_exploration_blocked_warning()
    assert "1.1" in msg
    assert "Implement" in msg


def test_ls_exploration_abort():
    from bright_vision_core.agent_turn import (
        LS_EXPLORATION_ABORT_THRESHOLD,
        exploration_ls_abort_warning,
        is_ls_tool_output_event,
        ls_call_count_from_events,
        should_abort_turn_for_ls_exploration,
    )

    ls_event = {"type": "tool_output", "text": "Tool Call: Local • ls"}
    assert is_ls_tool_output_event(ls_event)
    events = [ls_event] * LS_EXPLORATION_ABORT_THRESHOLD
    assert ls_call_count_from_events(events) == LS_EXPLORATION_ABORT_THRESHOLD
    assert should_abort_turn_for_ls_exploration(
        total_ls_calls=LS_EXPLORATION_ABORT_THRESHOLD,
        had_write=False,
        edit_failure_continuation=False,
    )
    assert not should_abort_turn_for_ls_exploration(
        total_ls_calls=LS_EXPLORATION_ABORT_THRESHOLD,
        had_write=True,
        edit_failure_continuation=False,
    )
    msg = exploration_ls_abort_warning(total=4)
    assert "ls call" in msg
    assert "1.1" in msg


def test_readrange_tool_error_abort():
    from bright_vision_core.agent_turn import (
        is_readrange_tool_error_event,
        readrange_failure_abort_warning,
        should_abort_turn_for_readrange_failures,
    )

    traceback_err = {
        "type": "tool_error",
        "text": (
            "Traceback (most recent call last):\n"
            '  File ".../read_range.py", line 632, in format_output\n'
            "AttributeError: 'int' object has no attribute 'splitlines'"
        ),
    }
    batch_err = {
        "type": "tool_error",
        "text": "Errors encountered for 2 operation(s)",
    }
    edit_err = {
        "type": "tool_error",
        "text": "Error in EditText: Please call `ReadRange` first",
    }

    assert is_readrange_tool_error_event(traceback_err)
    assert is_readrange_tool_error_event(batch_err)
    assert not is_readrange_tool_error_event(edit_err)

    assert not should_abort_turn_for_readrange_failures(
        total_readrange_failures=1,
        edit_failure_continuation=False,
    )
    assert should_abort_turn_for_readrange_failures(
        total_readrange_failures=2,
        edit_failure_continuation=False,
    )
    msg = readrange_failure_abort_warning(total=2)
    assert "ReadRange failure" in msg
    assert "Implement" in msg


def test_shell_output_in_events():
    from bright_vision_core.agent_turn import shell_output_in_events

    assert shell_output_in_events([{"type": "tool_output", "text": "Running find ."}])
    assert shell_output_in_events(
        [{"type": "tool_output", "text": "Recovered prose shell (read-only):\n$ find\n."}]
    )
    assert not shell_output_in_events([{"type": "tool_output", "text": "41k ↑ 256 ↓"}])


def test_edit_tool_failures_in_events():
    from bright_vision_core.agent_turn import edit_tool_failures_in_events

    events = [
        {"type": "tool_output", "text": "ok"},
        {
            "type": "tool_error",
            "text": "Error in EditText: Please call `ReadRange` first",
        },
    ]
    assert len(edit_tool_failures_in_events(events)) == 1


def test_edit_failure_turn_warning_no_edits():
    from bright_vision_core.agent_turn import edit_failure_turn_warning

    msg = edit_failure_turn_warning(
        events=[{"type": "tool_error", "text": "Error in EditText: No edits were successfully applied"}],
        edited_files=[],
    )
    assert msg is not None
    assert "ReadRange" in msg
    assert "UpdateTodoList" in msg


def test_edit_failure_turn_warning_with_partial_edits():
    from bright_vision_core.agent_turn import edit_failure_turn_warning

    msg = edit_failure_turn_warning(
        events=[{"type": "tool_error", "text": "Error in EditText: bounds"}],
        edited_files=["lib/foo.dart"],
    )
    assert msg is not None
    assert "One or more EditText calls failed" in msg


def test_should_auto_continue_after_edit_failure():
    from bright_vision_core.agent_turn import should_auto_continue_after_edit_failure

    events = [{"type": "tool_error", "text": "Error in EditText: fail"}]
    assert should_auto_continue_after_edit_failure(
        events=events, agent_cmd=False, edit_failure_continuation=False
    )
    assert not should_auto_continue_after_edit_failure(
        events=events, agent_cmd=True, edit_failure_continuation=False
    )
    assert not should_auto_continue_after_edit_failure(
        events=events, agent_cmd=False, edit_failure_continuation=True
    )


def test_should_abort_turn_for_edit_failures():
    from bright_vision_core.agent_turn import (
        EDIT_FAILURE_ABORT_THRESHOLD,
        should_abort_turn_for_edit_failures,
    )

    assert should_abort_turn_for_edit_failures(
        consecutive_edit_failures=EDIT_FAILURE_ABORT_THRESHOLD,
        total_edit_failures=EDIT_FAILURE_ABORT_THRESHOLD,
        agent_cmd=False,
        edit_failure_continuation=False,
    )
    assert not should_abort_turn_for_edit_failures(
        consecutive_edit_failures=1,
        total_edit_failures=1,
        agent_cmd=False,
        edit_failure_continuation=False,
    )
    assert not should_abort_turn_for_edit_failures(
        consecutive_edit_failures=5,
        total_edit_failures=5,
        agent_cmd=True,
        edit_failure_continuation=False,
    )


def test_edit_success_resets_consecutive_counter_logic():
    from bright_vision_core.agent_turn import (
        is_edit_tool_success_event,
        is_read_range_success_event,
    )

    assert is_edit_tool_success_event(
        {"type": "tool_output", "text": "Applied 1 edits in lib/foo.dart"}
    )
    assert is_read_range_success_event(
        {"type": "tool_output", "text": "✅ Retrieved context for 1 operation(s)"}
    )


def test_agent_ran_flutter_via_shell_detects_missing_binary():
    from bright_vision_core.agent_turn import agent_ran_flutter_via_shell

    events = [
        {
            "type": "tool_output",
            "text": "Shell command completed within 45s timeout with exit code 127. Output:\nbsh:1: command not found: flutter\n",
        }
    ]
    assert agent_ran_flutter_via_shell(events)


def test_duplicate_tool_call_detection_and_abort():
    from bright_vision_core.agent_turn import (
        DUPLICATE_TOOL_CALL_ABORT_THRESHOLD,
        duplicate_tool_call_abort_warning,
        is_duplicate_tool_call_error_event,
        should_abort_turn_for_duplicate_tool_calls,
    )

    dup_event = {
        "type": "tool_error",
        "text": "Error in ContextManager: Tool 'ContextManager' has been called with identical parameters. Duplicate tool call rejected.",
    }
    other_error = {"type": "tool_error", "text": "Error in EditText: bounds"}
    wrong_type = {"type": "tool_output", "text": "Duplicate tool call rejected."}

    assert is_duplicate_tool_call_error_event(dup_event)
    assert not is_duplicate_tool_call_error_event(other_error)
    assert not is_duplicate_tool_call_error_event(wrong_type)

    # Below threshold — do not abort
    assert not should_abort_turn_for_duplicate_tool_calls(
        total_duplicate_calls=DUPLICATE_TOOL_CALL_ABORT_THRESHOLD - 1,
        edit_failure_continuation=False,
    )
    # At threshold — abort
    assert should_abort_turn_for_duplicate_tool_calls(
        total_duplicate_calls=DUPLICATE_TOOL_CALL_ABORT_THRESHOLD,
        edit_failure_continuation=False,
    )
    # Bypassed during continuations
    assert not should_abort_turn_for_duplicate_tool_calls(
        total_duplicate_calls=DUPLICATE_TOOL_CALL_ABORT_THRESHOLD,
        edit_failure_continuation=True,
    )
    assert not should_abort_turn_for_duplicate_tool_calls(
        total_duplicate_calls=DUPLICATE_TOOL_CALL_ABORT_THRESHOLD,
        edit_failure_continuation=False,
        agent_continuation=True,
    )

    msg = duplicate_tool_call_abort_warning(total=5)
    assert "5 duplicate tool call" in msg
    assert "loop" in msg
    assert "Clear chat" in msg
