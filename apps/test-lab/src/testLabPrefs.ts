/** Persist Test Lab run-option checkboxes between sessions. */

const STORAGE_KEY = 'bright-vision-test-lab-run-options'

export interface TestLabRunPrefs {
  skipLlm: boolean
  skipGpu: boolean
  failFast: boolean
  shortCircuit: boolean
  saveTranscript: boolean
  useBrightDate: boolean
  specGenPhased: boolean
  llmRouter: boolean
  cloudLlm: boolean
  verifyEars: boolean
  shippedScenarios: boolean
  strictPhasedPytest: boolean
  implementAutoAdvanceLlm: boolean
}

export const DEFAULT_TEST_LAB_RUN_PREFS: TestLabRunPrefs = {
  skipLlm: false,
  skipGpu: false,
  failFast: false,
  shortCircuit: false,
  saveTranscript: false,
  useBrightDate: false,
  specGenPhased: false,
  llmRouter: false,
  cloudLlm: false,
  verifyEars: false,
  shippedScenarios: false,
  strictPhasedPytest: false,
  implementAutoAdvanceLlm: false,
}

/** Turn on every optional diagnostic lane (respects router/cloud preflight). */
export function fullSuiteRunPrefs(
  prefs: TestLabRunPrefs,
  opts: { cloudLlmConfigured: boolean; routerLaneReady: boolean }
): TestLabRunPrefs {
  return {
    ...prefs,
    skipLlm: false,
    verifyEars: true,
    shippedScenarios: true,
    specGenPhased: true,
    strictPhasedPytest: true,
    llmRouter: opts.routerLaneReady,
    cloudLlm: opts.cloudLlmConfigured,
  }
}

export function loadTestLabRunPrefs(): TestLabRunPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TEST_LAB_RUN_PREFS }
    const parsed = JSON.parse(raw) as Partial<TestLabRunPrefs>
    return { ...DEFAULT_TEST_LAB_RUN_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_TEST_LAB_RUN_PREFS }
  }
}

export function saveTestLabRunPrefs(prefs: TestLabRunPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}
