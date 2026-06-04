import { defineConfig, devices } from '@playwright/test'
import type { Project } from '@playwright/test'
import {
  LLM_E2E_FILE_ORDER,
  LLM_E2E_SPEC_ALL_FILE,
  LLM_E2E_SPEC_FILES,
  LLM_E2E_SPEC_PHASED_FILE,
} from './e2e/llm-suite-order'

const skipSpecGen = process.env['BV_SKIP_SPEC_GEN_E2E'] === '1'
const specGenPhased = process.env['E2E_SPEC_GEN_PHASED'] === '1'

const llmFiles = skipSpecGen
  ? LLM_E2E_FILE_ORDER.filter((f) => f !== LLM_E2E_SPEC_ALL_FILE)
  : [...LLM_E2E_FILE_ORDER]

/**
 * Real LLM e2e: Ollama + bright-vision-core on :8741 (no mocked /api/core).
 *
 *   E2E_LLM=1 yarn test:e2e:llm
 *
 * File order: `e2e/llm-suite-order.ts` + optional phased file when
 * `E2E_SPEC_GEN_PHASED=1` (Test Lab checkbox / `--spec-gen-phased`).
 */
const suiteLive =
  process.env['BV_TEST_SUITE_ACTIVE'] === '1' ||
  process.env['BV_TEST_SUITE_LIVE_OUTPUT'] === '1'

const sharedUse = {
  ...devices['Desktop Chrome'],
  baseURL: 'http://127.0.0.1:4173',
}

export default defineConfig({
  testDir: 'e2e',
  reporter: suiteLive ? [['line']] : undefined,
  fullyParallel: false,
  workers: 1,
  timeout: Math.max(
    900_000,
    (Number(process.env['LLM_SPEC_GEN_TIMEOUT_S']) || 1800) * 1000 * 4 + 600_000
  ),
  forbidOnly: !!process.env.CI,
  retries: 0,
  globalSetup: './e2e/global-llm-setup.ts',
  globalTeardown: './e2e/global-llm-teardown.ts',
  webServer: {
    command: 'sh scripts/e2e-preview.sh',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    // globalSetup starts :8741 first; allow headroom when a cold ``yarn build`` is required.
    timeout: Math.max(
      120_000,
      Number(process.env.E2E_PREVIEW_WEBSERVER_TIMEOUT_MS) || 300_000
    ),
    env: {
      E2E: '1',
      E2E_LLM: '1',
    },
  },
  projects: buildLlmProjects(),
})

function buildLlmProjects(): Project[] {
  const routerOnly = process.env['BV_ROUTER_LLM_E2E_ONLY'] === '1'
  if (routerOnly) {
    return [
      {
        name: 'router-llm',
        testMatch: /router-llm\.spec\.ts/,
        use: sharedUse,
      },
    ]
  }

  const projects: Project[] = []
  let seq = 1

  for (const file of llmFiles) {
    if ((LLM_E2E_SPEC_FILES as readonly string[]).includes(file)) {
      continue
    }
    projects.push({
      name: `${String(seq++).padStart(2, '0')}-${file.replace(/\.spec\.ts$/, '')}`,
      testMatch: file,
      use: sharedUse,
    })
  }

  if (!skipSpecGen) {
    if (specGenPhased) {
      projects.push({
        name: `${String(seq++).padStart(2, '0')}-spec-generate-phased`,
        testMatch: LLM_E2E_SPEC_PHASED_FILE,
        use: sharedUse,
      })
    }
    projects.push({
      name: `${String(seq++).padStart(2, '0')}-spec-generate-all`,
      testMatch: LLM_E2E_SPEC_ALL_FILE,
      use: sharedUse,
    })
  }

  return projects
}
