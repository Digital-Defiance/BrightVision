/**
 * Explicit LLM e2e file order. Playwright does not honor `testMatch` array order;
 * it discovers files alphabetically.
 *
 * `playwright.llm.config.ts` maps each entry to a sequential project.
 * Phased spec-gen is a separate file, included only when `E2E_SPEC_GEN_PHASED=1`.
 */

export const LLM_E2E_SPEC_PHASED_FILE = 'spec-generate-phased-llm.spec.ts'
export const LLM_E2E_SPEC_ALL_FILE = 'spec-generate-all-llm.spec.ts'

/** Files always run in the default LLM lane (checkbox off = all-layers only). */
export const LLM_E2E_FILE_ORDER = [
  'hello-llm.spec.ts',
  'agent-llm.spec.ts',
  'context-llm.spec.ts',
  'edit-block-llm.spec.ts',
  'todo-list-llm.spec.ts',
  'transcript-llm.spec.ts',
  'superproject-llm.spec.ts',
  LLM_E2E_SPEC_ALL_FILE,
] as const

/** Opt-in via `yarn test:e2e:llm:router` (separate config). */
export const LLM_ROUTER_FILE = 'router-llm.spec.ts'

export const LLM_E2E_SPEC_FILES = [LLM_E2E_SPEC_PHASED_FILE, LLM_E2E_SPEC_ALL_FILE] as const
