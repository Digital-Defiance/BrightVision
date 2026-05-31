import { defineConfig, devices } from '@playwright/test'

/** Test Lab / ``yarn test:everything`` release tier: mocked e2e only (LLM + integration run later). */
const suiteSmokeE2e =
  process.env.BV_TEST_SUITE_SMOKE_E2E === '1' || process.env.BV_TEST_SUITE_ACTIVE === '1'

export default defineConfig({
  testDir: 'e2e',
  testIgnore: [
    '**/hello-llm.spec.ts',
    ...(suiteSmokeE2e
      ? ['**/*-llm.spec.ts', '**/integration/**']
      : []),
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'sh scripts/e2e-preview.sh',
    url: 'http://127.0.0.1:4173',
    // Local: reuse after test-local frees :4173; CI always starts fresh. Stale non-E2E preview: run free-e2e-preview-port.sh.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
