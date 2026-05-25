import { defineConfig, devices } from '@playwright/test'

/**
 * Real LLM e2e: Ollama + bright-vision-core on :8741 (no mocked /api/core).
 *
 *   E2E_LLM=1 yarn test:e2e:llm
 *
 * Requires: Ollama running, model pulled (see e2e/helpers/llmEnv.ts).
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'hello-llm.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  globalSetup: './e2e/global-llm-setup.ts',
  globalTeardown: './e2e/global-llm-teardown.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command:
      'E2E=1 E2E_LLM=1 yarn build && E2E=1 E2E_LLM=1 yarn vite preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
