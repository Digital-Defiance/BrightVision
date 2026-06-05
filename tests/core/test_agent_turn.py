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


def test_empty_agent_turn_warning():
    from bright_vision_core.agent_turn import empty_agent_turn_warning

    msg = empty_agent_turn_warning(had_tool_activity=False, assistant_text="")
    assert msg is not None
    assert "/agent finished immediately" in msg
    assert empty_agent_turn_warning(had_tool_activity=True, assistant_text="") is None
    assert empty_agent_turn_warning(had_tool_activity=False, assistant_text="hi") is None


def test_shell_output_in_events():
    from bright_vision_core.agent_turn import shell_output_in_events

    assert shell_output_in_events([{"type": "tool_output", "text": "Running find ."}])
    assert shell_output_in_events(
        [{"type": "tool_output", "text": "Recovered prose shell (read-only):\n$ find\n."}]
    )
    assert not shell_output_in_events([{"type": "tool_output", "text": "41k ↑ 256 ↓"}])
