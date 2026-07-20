import { defineConfig, devices } from '@playwright/test'

/**
 * Real integration e2e: live bright-vision-core on :8741, Vite preview proxies /api/core
 * (no installMockCoreApi). Does not require Ollama unless a test sends chat messages.
 *
 *   yarn test:e2e:integration
 *
 * Prerequisites: source activate.sh ( .venv + bright_vision_core )
 */
export default defineConfig({
  testDir: 'e2e/integration',
  fullyParallel: false,
  workers: 1,
  timeout: process.env.BV_TEST_SUITE_ACTIVE === '1' ? 300_000 : 180_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  globalSetup: './e2e/global-integration-setup.ts',
  globalTeardown: './e2e/global-integration-teardown.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'E2E=1 E2E_INTEGRATION=1 sh scripts/e2e-preview.sh',
    url: 'http://127.0.0.1:4173',
    // Never reuse mocked-e2e preview (health stub only, no :8741 proxy).
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
