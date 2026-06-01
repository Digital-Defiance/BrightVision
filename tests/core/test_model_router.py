from bright_vision_core.model_router import (
    ModelRouterConfig,
    classify_prompt,
    context_exceeds_fast_model_limit,
    estimate_message_tokens,
    estimate_prompt_tokens,
    should_escalate_fast_turn,
)


def test_classify_low_tokens_fast_keyword():
    router = ModelRouterConfig(
        enabled=True,
        fast_model="ollama_chat/small",
        heavy_model="ollama_chat/big",
    )
    d = classify_prompt(
        "Rename the button label to Save",
        message_tokens=500,
        router=router,
        heavy_model_name="ollama_chat/big",
    )
    assert d.tier == "fast"
    assert d.model_name == "ollama_chat/small"


def test_classify_architect_heavy():
    router = ModelRouterConfig(
        enabled=True,
        fast_model="ollama_chat/small",
        heavy_model="ollama_chat/big",
    )
    d = classify_prompt(
        "Refactor the race condition in the session pool",
        message_tokens=800,
        router=router,
        heavy_model_name="ollama_chat/big",
    )
    assert d.tier == "heavy"


def test_classify_high_message_tokens_heavy():
    router = ModelRouterConfig(
        enabled=True,
        fast_model="ollama_chat/small",
        heavy_model="ollama_chat/big",
        token_heavy_min=12_000,
    )
    d = classify_prompt(
        "fix typo",
        message_tokens=15_000,
        router=router,
        heavy_model_name="ollama_chat/big",
    )
    assert d.tier == "heavy"
    assert "msg_tokens>=" in d.reasons[0]


def test_files_in_chat_do_not_force_heavy():
    """Capped file bump with small message must not route heavy when under fast window."""
    router = ModelRouterConfig(
        enabled=True,
        fast_model="ollama_chat/small",
        heavy_model="ollama_chat/big",
    )
    msg = "I'd like to add @ references like we have for /add with chips"
    message_tokens = estimate_message_tokens(msg)
    context_tokens = estimate_prompt_tokens(msg, files_in_chat=4)
    assert context_tokens > message_tokens
    assert message_tokens < router.token_fast_max
    assert not context_exceeds_fast_model_limit(
        context_tokens, router.fast_model, fast_max_input=32_768
    )[0]
    d = classify_prompt(
        msg,
        message_tokens=message_tokens,
        context_tokens=context_tokens,
        router=router,
        heavy_model_name="ollama_chat/big",
    )
    assert d.tier == "fast"
    assert d.estimated_tokens == context_tokens


def test_context_exceeds_fast_model_limit():
    exceeds, limit = context_exceeds_fast_model_limit(
        17_670,
        "ollama_chat/deepseek-coder:6.7b",
        fast_max_input=16_384,
    )
    assert exceeds is True
    assert limit == 16_384
    fits, _ = context_exceeds_fast_model_limit(
        10_000,
        "ollama_chat/deepseek-coder:6.7b",
        fast_max_input=16_384,
    )
    assert fits is False


def test_classify_routes_heavy_when_context_exceeds_fast_window():
    """Repro: short UI message but full session > deepseek 16k → heavy, not fast."""
    router = ModelRouterConfig(
        enabled=True,
        fast_model="ollama_chat/deepseek-coder:6.7b",
        heavy_model="ollama_chat/qwen3.6:27b-q4_K_M",
    )
    msg = "tweak the chat panel label"
    message_tokens = estimate_message_tokens(msg)
    assert message_tokens < router.token_fast_max
    d = classify_prompt(
        msg,
        message_tokens=message_tokens,
        context_tokens=17_670,
        router=router,
        heavy_model_name="ollama_chat/qwen3.6:27b-q4_K_M",
    )
    assert d.tier == "heavy"
    assert d.model_name == "ollama_chat/qwen3.6:27b-q4_K_M"
    assert any("fast_max=" in r for r in d.reasons)


def test_fast_keyword_loses_to_context_overflow():
    router = ModelRouterConfig(
        enabled=True,
        fast_model="ollama_chat/deepseek-coder:6.7b",
        heavy_model="ollama_chat/big",
    )
    d = classify_prompt(
        "Rename the button label to Save",
        message_tokens=200,
        context_tokens=20_000,
        router=router,
        heavy_model_name="ollama_chat/big",
    )
    assert d.tier == "heavy"


def test_code_task_middle_band_defaults_fast():
    router = ModelRouterConfig(
        enabled=True,
        fast_model="ollama_chat/small",
        heavy_model="ollama_chat/big",
    )
    d = classify_prompt(
        "implement the login form",
        message_tokens=800,
        router=router,
        heavy_model_name="ollama_chat/big",
    )
    assert d.tier == "fast"
    assert "default_fast" in d.reasons


def test_escalate_when_fast_no_edits():
    router = ModelRouterConfig(enabled=True, fast_model="a", heavy_model="b")
    decision = classify_prompt(
        "implement the login form",
        message_tokens=800,
        router=router,
        heavy_model_name="b",
        force_tier="fast",
    )
    assert should_escalate_fast_turn(
        decision,
        router=router,
        user_message="implement the login form",
        edited_files=[],
        assistant_text="ok",
    )


def test_escalate_on_context_limit_tool_error():
    router = ModelRouterConfig(
        enabled=True,
        fast_model="ollama_chat/deepseek-coder:6.7b",
        heavy_model="ollama_chat/big",
    )
    decision = classify_prompt(
        "tweak git tab",
        message_tokens=200,
        context_tokens=5_000,
        router=router,
        heavy_model_name="ollama_chat/big",
        force_tier="fast",
    )
    err = (
        "Your estimated chat context of 32,672 tokens exceeds the "
        "16,384 token limit for ollama_chat/deepseek-coder:6.7b!"
    )
    assert should_escalate_fast_turn(
        decision,
        router=router,
        user_message="tweak git tab",
        edited_files=[],
        assistant_text="",
        had_tool_error=True,
        tool_error_text=err,
    )


def test_lint_in_long_message_not_used_when_routing_short_intent():
    """Spec preamble 'EARS lint' must not force fast when user message is unrelated."""
    router = ModelRouterConfig(
        enabled=True,
        fast_model="ollama_chat/small",
        heavy_model="ollama_chat/big",
    )
    preamble = "## Spec-focus mode\nEARS lint requirements\n" + ("x" * 5000)
    short = "In the Git tab, add revert and open-in-editor cues."
    d = classify_prompt(
        short,
        message_tokens=estimate_message_tokens(short),
        context_tokens=estimate_prompt_tokens(preamble + short, files_in_chat=0),
        router=router,
        heavy_model_name="ollama_chat/big",
    )
    assert d.tier != "fast" or "keyword:lint" not in " ".join(d.reasons)


def test_estimate_tokens_with_files_capped():
    bare = estimate_prompt_tokens("hello")
    with_files = estimate_prompt_tokens("hello", files_in_chat=10)
    assert with_files > bare
    assert with_files <= bare + 2000
