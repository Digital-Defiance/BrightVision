"""Property-based tests for model priority routing and preload logic.

Feature: model-priority-hopper
Uses hypothesis to validate correctness properties 6, 7, 9, 10, 11, 15.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from bright_vision_core.model_router import (
    ModelPoolEntry,
    ModelRouterConfig,
    RouteDecision,
    RouteTurnContext,
    classify_prompt,
    pick_tier_model,
    preload_priority_list,
    resolve_tier_models,
)


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Model tag strategy — realistic Ollama model names
_model_tag_chars = st.sampled_from(
    "abcdefghijklmnopqrstuvwxyz0123456789-_."
)
model_tag_st = st.text(
    alphabet=_model_tag_chars, min_size=3, max_size=30
).map(lambda s: f"{s}:7b")


def unique_model_tags(min_size: int = 1, max_size: int = 6):
    """Generate a list of unique model tags."""
    return st.lists(
        model_tag_st, min_size=min_size, max_size=max_size, unique=True
    )


def priority_ranked_pool(tier: str, min_size: int = 2, max_size: int = 5):
    """Generate a list of ModelPoolEntry for a single tier with priority ranks."""
    return unique_model_tags(min_size=min_size, max_size=max_size).map(
        lambda tags: [
            ModelPoolEntry(
                model=tag, tier=tier, enabled=True, priority_rank=i
            )
            for i, tag in enumerate(tags)
        ]
    )


# ---------------------------------------------------------------------------
# Mock Ollama client for preload tests
# ---------------------------------------------------------------------------


@dataclass
class MockOllamaClient:
    """Mock OllamaClient with configurable failures and model sizes."""

    generate_calls: list[str] = field(default_factory=list)
    show_calls: list[str] = field(default_factory=list)
    model_sizes: dict[str, int] = field(default_factory=dict)
    failing_models: set[str] = field(default_factory=set)

    async def post_generate(self, model: str, *, keep_alive: int = -1) -> None:
        self.generate_calls.append(model)
        if model in self.failing_models:
            raise RuntimeError(f"Preload failed: {model}")

    async def show_model(self, model: str) -> dict[str, Any]:
        self.show_calls.append(model)
        size = self.model_sizes.get(model)
        if size is not None:
            return {"size": size}
        return {}


# ---------------------------------------------------------------------------
# Property 6: Preload order matches Priority_List
# Feature: model-priority-hopper, Property 6: Preload order matches Priority_List
# ---------------------------------------------------------------------------


class TestProperty6PreloadOrder:
    """**Validates: Requirements 3.1, 3.4**

    For any Priority_List of length N, preload requests SHALL be issued in index
    order (0 first, N-1 last). If preload at index K fails, models at K+1..N-1
    still attempted.
    """

    @settings(max_examples=100)
    @given(tags=unique_model_tags(min_size=1, max_size=8))
    def test_preload_issues_requests_in_index_order(self, tags: list[str]):
        """Preload requests are issued in priority-list index order."""
        client = MockOllamaClient()

        result = asyncio.run(
            preload_priority_list(tags, ollama_client=client)
        )

        # All tags preloaded successfully
        assert result == tags
        # Generate calls in exact index order
        assert client.generate_calls == tags

    @settings(max_examples=100)
    @given(
        data=st.data(),
        tags=unique_model_tags(min_size=2, max_size=8),
    )
    def test_preload_continues_after_failure(self, data, tags: list[str]):
        """If preload at index K fails, models at K+1..N-1 still attempted."""
        # Pick a random index to fail
        fail_idx = data.draw(st.integers(min_value=0, max_value=len(tags) - 1))
        fail_tag = tags[fail_idx]

        client = MockOllamaClient(failing_models={fail_tag})

        result = asyncio.run(
            preload_priority_list(tags, ollama_client=client)
        )

        # The failed model is not in the result
        assert fail_tag not in result
        # All other models are present in order
        expected = [t for t in tags if t != fail_tag]
        assert result == expected
        # All tags were attempted (generate called for each)
        assert len(client.generate_calls) == len(tags)
        # Order of generate calls matches index order
        assert client.generate_calls == tags


# ---------------------------------------------------------------------------
# Property 7: VRAM budget cutoff
# Feature: model-priority-hopper, Property 7: VRAM budget cutoff
# ---------------------------------------------------------------------------


class TestProperty7VRAMBudgetCutoff:
    """**Validates: Requirements 3.2**

    For any Priority_List with VRAM sizes and budget B, preloader SHALL preload
    in priority order until cumulative exceeds B. Preloaded set is a prefix of
    Priority_List.
    """

    @settings(max_examples=100)
    @given(
        tags=unique_model_tags(min_size=1, max_size=6),
        data=st.data(),
    )
    def test_preloaded_set_is_prefix_of_priority_list(self, tags: list[str], data):
        """Preloaded models form a prefix of the priority list."""
        # Generate sizes for each model (1 GB to 20 GB)
        sizes = data.draw(
            st.lists(
                st.integers(min_value=1_000_000_000, max_value=20_000_000_000),
                min_size=len(tags),
                max_size=len(tags),
            )
        )
        # Generate a budget that is at least the size of the first model
        # (so at least one model can be preloaded) — or smaller to test zero-prefix
        budget = data.draw(
            st.integers(min_value=0, max_value=sum(sizes) + 1_000_000_000)
        )

        model_sizes = dict(zip(tags, sizes))
        client = MockOllamaClient(model_sizes=model_sizes)

        result = asyncio.run(
            preload_priority_list(
                tags, ollama_client=client, vram_budget_bytes=budget
            )
        )

        # Result must be a prefix of tags
        assert tags[: len(result)] == result

        # Verify cumulative VRAM of preloaded models does not exceed budget
        # (except the first model, which is always attempted if budget > 0)
        cumulative = 0
        for tag in result:
            cumulative += model_sizes[tag]
        # If result is non-empty, the cumulative of the prefix should not exceed budget
        # (the implementation checks BEFORE preloading: cumulative + next_size > budget → stop)
        if result:
            # All models up to the last preloaded one fit within budget
            prefix_without_last = result[:-1]
            cumulative_before_last = sum(model_sizes[t] for t in prefix_without_last)
            # The last model was added because cumulative_before_last + its size <= budget
            assert cumulative_before_last + model_sizes[result[-1]] <= budget

    @settings(max_examples=100)
    @given(
        tags=unique_model_tags(min_size=2, max_size=6),
        data=st.data(),
    )
    def test_budget_stops_before_exceeding(self, tags: list[str], data):
        """When next model would exceed budget, stop preloading."""
        # Make all models the same size for predictable behavior
        model_size = data.draw(st.integers(min_value=1_000_000_000, max_value=10_000_000_000))
        # Budget allows exactly K models (K from 1 to len(tags)-1)
        k = data.draw(st.integers(min_value=1, max_value=len(tags) - 1))
        budget = model_size * k

        model_sizes = {tag: model_size for tag in tags}
        client = MockOllamaClient(model_sizes=model_sizes)

        result = asyncio.run(
            preload_priority_list(
                tags, ollama_client=client, vram_budget_bytes=budget
            )
        )

        # Exactly K models should be preloaded
        assert len(result) == k
        assert result == tags[:k]


# ---------------------------------------------------------------------------
# Property 9: Route to highest-priority model in tier
# Feature: model-priority-hopper, Property 9: Route to highest-priority model in tier
# ---------------------------------------------------------------------------


class TestProperty9RouteHighestPriority:
    """**Validates: Requirements 4.1, 4.3**

    For any tier with multiple enabled models ordered by priority rank, router
    SHALL select lowest priority rank. When prefer_secondary is true, select
    second-lowest.
    """

    @settings(max_examples=100)
    @given(pool=priority_ranked_pool("code", min_size=2, max_size=5))
    def test_picks_lowest_priority_rank(self, pool: list[ModelPoolEntry]):
        """Router selects model with lowest priority_rank (highest priority)."""
        model, is_swap = pick_tier_model(pool, "code")

        # Should be the model with priority_rank=0
        assert model == pool[0].model
        # No resident set → is_swap not checked here (residency tested in Property 10)

    @settings(max_examples=100)
    @given(pool=priority_ranked_pool("think", min_size=2, max_size=5))
    def test_prefer_secondary_picks_second_lowest(self, pool: list[ModelPoolEntry]):
        """When prefer_secondary is true, picks model with second-lowest rank."""
        # Set prefer_secondary on any entry in the pool
        pool[0] = ModelPoolEntry(
            model=pool[0].model,
            tier=pool[0].tier,
            enabled=True,
            priority_rank=pool[0].priority_rank,
            prefer_secondary=True,
        )

        model, _ = pick_tier_model(pool, "think")

        # Should pick the second model (priority_rank=1)
        assert model == pool[1].model

    @settings(max_examples=100)
    @given(tag=model_tag_st)
    def test_prefer_secondary_single_model_uses_only_model(self, tag: str):
        """When prefer_secondary set but only one model, route to that model."""
        pool = [
            ModelPoolEntry(
                model=tag, tier="fast", enabled=True, priority_rank=0,
                prefer_secondary=True,
            )
        ]

        model, _ = pick_tier_model(pool, "fast")
        assert model == tag


# ---------------------------------------------------------------------------
# Property 10: Non-resident model swap event
# Feature: model-priority-hopper, Property 10: Non-resident model swap event
# ---------------------------------------------------------------------------


class TestProperty10NonResidentSwap:
    """**Validates: Requirements 4.2**

    For any route decision where selected model not resident, swap=True and model
    still selected.
    """

    @settings(max_examples=100)
    @given(pool=priority_ranked_pool("code", min_size=2, max_size=5))
    def test_non_resident_model_has_swap_true(self, pool: list[ModelPoolEntry]):
        """When selected model is not resident, is_swap is True."""
        # The expected model is pool[0].model — make it NOT resident
        expected_model = pool[0].model
        other_models = {p.model for p in pool[1:]}
        resident = other_models  # All others resident except the expected

        model, is_swap = pick_tier_model(pool, "code", resident_models=resident)

        assert model == expected_model
        assert is_swap is True

    @settings(max_examples=100)
    @given(pool=priority_ranked_pool("think", min_size=2, max_size=5))
    def test_resident_model_has_swap_false(self, pool: list[ModelPoolEntry]):
        """When selected model IS resident, is_swap is False."""
        expected_model = pool[0].model
        resident = {expected_model}

        model, is_swap = pick_tier_model(pool, "think", resident_models=resident)

        assert model == expected_model
        assert is_swap is False

    @settings(max_examples=100)
    @given(pool=priority_ranked_pool("fast", min_size=1, max_size=5))
    def test_no_resident_set_means_no_swap(self, pool: list[ModelPoolEntry]):
        """When resident_models is None, is_swap is always False."""
        model, is_swap = pick_tier_model(pool, "fast", resident_models=None)

        assert is_swap is False


# ---------------------------------------------------------------------------
# Property 11: Route event includes priority metadata
# Feature: model-priority-hopper, Property 11: Route event includes priority metadata
# ---------------------------------------------------------------------------


class TestProperty11RouteEventMetadata:
    """**Validates: Requirements 4.4**

    For any route decision with multi-model pool, event SHALL include
    priority_list and priority_rank.
    """

    @settings(max_examples=100)
    @given(
        pool=priority_ranked_pool("code", min_size=2, max_size=4),
        data=st.data(),
    )
    def test_classify_prompt_includes_priority_metadata(
        self, pool: list[ModelPoolEntry], data
    ):
        """RouteDecision includes priority_list_snapshot and priority_rank."""
        # Build a router config with the generated pool
        priority_list = [e.model for e in pool]
        # Add a fast model so the router is valid
        fast_model = data.draw(model_tag_st.filter(lambda t: t not in priority_list))
        fast_entry = ModelPoolEntry(
            model=fast_model, tier="fast", enabled=True, priority_rank=len(pool)
        )
        full_pool = [fast_entry] + pool

        router = ModelRouterConfig(
            enabled=True,
            fast_model=fast_model,
            code_model=pool[0].model,
            model_pool=full_pool,
            priority_list=priority_list,
        )

        # Force tier to "code" to hit the multi-model path
        decision = classify_prompt(
            "implement the feature",
            message_tokens=500,
            router=router,
            code_model_name=pool[0].model,
            force_tier="code",
        )

        # Must include priority metadata
        assert decision.priority_rank is not None
        assert decision.priority_rank == 0  # Highest priority model picked
        assert decision.priority_list_snapshot is not None
        assert decision.priority_list_snapshot == priority_list

    @settings(max_examples=100)
    @given(pool=priority_ranked_pool("think", min_size=2, max_size=4))
    def test_route_decision_priority_rank_matches_pool_entry(
        self, pool: list[ModelPoolEntry]
    ):
        """priority_rank in RouteDecision matches the pool entry's rank."""
        fast_tag = "fast-model:7b"
        fast_entry = ModelPoolEntry(
            model=fast_tag, tier="fast", enabled=True, priority_rank=99
        )
        full_pool = [fast_entry] + pool
        priority_list = [e.model for e in pool]

        router = ModelRouterConfig(
            enabled=True,
            fast_model=fast_tag,
            think_model=pool[0].model,
            code_model=pool[0].model,
            model_pool=full_pool,
            priority_list=priority_list,
        )

        decision = classify_prompt(
            "some prompt",
            message_tokens=500,
            router=router,
            force_tier="think",
        )

        assert decision.priority_rank == 0
        assert decision.model_name == pool[0].model


# ---------------------------------------------------------------------------
# Property 15: Backward compatibility — router
# Feature: model-priority-hopper, Property 15: Backward compatibility — router
# ---------------------------------------------------------------------------


class TestProperty15BackwardCompatibility:
    """**Validates: Requirements 7.2**

    For any single-model-per-tier config, router produces same tier/model as
    current implementation.
    """

    @settings(max_examples=100)
    @given(
        fast_tag=model_tag_st,
        code_tag=model_tag_st,
        think_tag=model_tag_st,
        data=st.data(),
    )
    def test_single_model_per_tier_same_as_legacy(
        self, fast_tag: str, code_tag: str, think_tag: str, data
    ):
        """Single-model-per-tier config routes identically to pre-priority behavior."""
        assume(fast_tag != code_tag and code_tag != think_tag and fast_tag != think_tag)

        # Legacy config: no model_pool, no priority_list
        legacy_router = ModelRouterConfig(
            enabled=True,
            fast_model=fast_tag,
            code_model=code_tag,
            think_model=think_tag,
        )

        # New config: single model per tier with pool but no multi-model priority
        pool = [
            ModelPoolEntry(model=fast_tag, tier="fast", enabled=True),
            ModelPoolEntry(model=code_tag, tier="code", enabled=True),
            ModelPoolEntry(model=think_tag, tier="think", enabled=True),
        ]
        new_router = ModelRouterConfig(
            enabled=True,
            fast_model=fast_tag,
            code_model=code_tag,
            think_model=think_tag,
            model_pool=pool,
            priority_list=[],
        )

        # Test with force_tier to isolate routing logic from pattern matching
        for tier in ("fast", "code", "think"):
            legacy_decision = classify_prompt(
                "test prompt",
                message_tokens=500,
                router=legacy_router,
                code_model_name=code_tag,
                think_model_name=think_tag,
                force_tier=tier,
            )
            new_decision = classify_prompt(
                "test prompt",
                message_tokens=500,
                router=new_router,
                code_model_name=code_tag,
                think_model_name=think_tag,
                force_tier=tier,
            )

            assert legacy_decision.tier == new_decision.tier, (
                f"Tier mismatch for force_tier={tier}: "
                f"{legacy_decision.tier} vs {new_decision.tier}"
            )
            assert legacy_decision.model_name == new_decision.model_name, (
                f"Model mismatch for force_tier={tier}: "
                f"{legacy_decision.model_name} vs {new_decision.model_name}"
            )

    @settings(max_examples=100)
    @given(
        fast_tag=model_tag_st,
        code_tag=model_tag_st,
    )
    def test_no_priority_list_no_priority_metadata(self, fast_tag: str, code_tag: str):
        """Without priority_list, route decisions have no priority metadata."""
        assume(fast_tag != code_tag)

        router = ModelRouterConfig(
            enabled=True,
            fast_model=fast_tag,
            code_model=code_tag,
            model_pool=[
                ModelPoolEntry(model=fast_tag, tier="fast", enabled=True),
                ModelPoolEntry(model=code_tag, tier="code", enabled=True),
            ],
            priority_list=[],
        )

        decision = classify_prompt(
            "rename the variable",
            message_tokens=100,
            router=router,
            code_model_name=code_tag,
            force_tier="fast",
        )

        # No priority metadata for single-model tier without priority_rank
        assert decision.priority_rank is None
        assert decision.priority_list_snapshot is None
