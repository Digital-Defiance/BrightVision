/**
 * Ordered pytest / Playwright substeps for long suite steps.
 * Keep in sync with `bright_vision_core/test_suite/manifest.py` (`llm:core`)
 * and `e2e/llm-suite-order.ts` (`e2e:llm`).
 */

/** Pytest node ids in run order (``llm:core``). */
export const LLM_CORE_PYTEST_SUBSTEPS: readonly string[] = [
  'tests/core/test_edit_block_llm.py::TestEditBlockLlm::test_add_patch_file_then_search_replace_block',
  'tests/core/test_hello_llm.py::TestHelloLlm::test_hello_message_streams_tokens_and_done',
  'tests/core/test_generate_spec_llm.py::TestGenerateSpecLlm::test_generate_spec_produces_sane_layers',
  'tests/core/test_generate_spec_llm.py::TestGenerateSpecLlm::test_phased_generate_spec_produces_sane_layers',
  'tests/core/test_context_llm.py::TestContextLlm::test_add_fixture_file_then_read_magic_constant',
  'tests/core/test_agent_llm.py::TestAgentLlm::test_agent_slash_streams_done_without_verbose_error',
  'tests/core/test_todo_list_llm.py::TestTodoListLlm::test_update_todo_list_writes_magic_task',
  'tests/core/test_transcript_llm.py::TestTranscriptLlm::test_transcript_includes_user_and_assistant_after_turn',
  'tests/core/test_generate_spec_parse.py::TestGenerateSpecParse::test_parse_three_sections',
  'tests/core/test_generate_spec_parse.py::TestGenerateSpecParse::test_sample_passes_sanity',
  'tests/core/test_generate_spec_parse.py::TestGenerateSpecParse::test_normalize_adds_design_traceability',
  'tests/core/test_generate_spec_parse.py::TestGenerateSpecParse::test_sample_is_kiro_rich',
  'tests/core/test_generate_spec_parse.py::TestGenerateSpecParse::test_richness_flags_thin_spec',
  'tests/core/test_generate_spec_parse.py::TestGenerateSpecParse::test_normalize_after_merge_for_phased_design',
  'tests/core/test_generate_spec_parse.py::TestGenerateSpecParse::test_normalize_numbered_tasks_from_plain_bullets',
  'tests/core/test_generate_spec_parse.py::TestGenerateSpecParse::test_normalize_tasks_via_traceability_helper',
  'tests/core/test_http_generate_spec_mock.py::TestHttpGenerateSpecMock::test_generate_spec_applies_sane_layers',
  'tests/core/test_http_generate_spec_mock.py::TestHttpGenerateSpecMock::test_background_spec_job_uses_ephemeral_chat_history',
  'tests/core/test_http_generate_spec_mock.py::TestHttpGenerateSpecMock::test_background_spec_job_wall_timeout_marks_error',
  'tests/core/test_http_generate_spec_mock.py::TestHttpGenerateSpecMock::test_background_spec_job_per_request_wall_timeout',
  'tests/core/test_http_generate_spec_mock.py::TestHttpGenerateSpecMock::test_background_spec_job_late_finish_does_not_overwrite_error',
  'tests/core/test_http_generate_spec_mock.py::TestHttpGenerateSpecMock::test_stale_running_job_reconciled_on_get',
  'tests/core/test_http_generate_spec_mock.py::TestHttpGenerateSpecMock::test_stale_running_job_not_reconciled_when_live_session',
] as const

/** Playwright spec files in run order (default ``e2e:llm`` lane). */
export const E2E_LLM_PLAYWRIGHT_SUBSTEPS: readonly string[] = [
  'hello-llm.spec.ts',
  'agent-llm.spec.ts',
  'context-llm.spec.ts',
  'edit-block-llm.spec.ts',
  'implement-llm.spec.ts',
  'implement-resume-llm.spec.ts',
  'todo-list-llm.spec.ts',
  'transcript-llm.spec.ts',
  'superproject-llm.spec.ts',
  'spec-generate-all-llm.spec.ts',
] as const

export const E2E_LLM_PHASED_SUBSTEP = 'spec-generate-phased-llm.spec.ts'

export const E2E_LLM_IMPLEMENT_AUTO_ADVANCE_SUBSTEP = 'implement-auto-advance-llm.spec.ts'

export const STEP_SUBSTEP_MANIFEST: Readonly<Record<string, readonly string[]>> = {
  'llm:core': LLM_CORE_PYTEST_SUBSTEPS,
  'e2e:llm': E2E_LLM_PLAYWRIGHT_SUBSTEPS,
  'e2e:llm:implement-auto-advance': [E2E_LLM_IMPLEMENT_AUTO_ADVANCE_SUBSTEP],
}

export function substepsForStep(
  stepId: string,
  opts?: { specGenPhased?: boolean }
): readonly string[] {
  if (stepId === 'e2e:llm' && opts?.specGenPhased) {
    return [E2E_LLM_PHASED_SUBSTEP, ...E2E_LLM_PLAYWRIGHT_SUBSTEPS]
  }
  return STEP_SUBSTEP_MANIFEST[stepId] ?? []
}
