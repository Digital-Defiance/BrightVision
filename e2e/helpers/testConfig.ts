import type { Page } from '@playwright/test'
import { installMockCoreApi } from './mockCoreApi'
import {
  applyOpenProjectStorage,
  openProjectStorageArgs,
  primeOpenProject,
} from './openProject'

/** Minimal config for web e2e (Vision API mocked at /api/core). */
export const E2E_CONFIG = {
  model: 'ollama_chat/test/model',
  ollamaApiBase: '',
  localLlmRoot: '',
  manageLocalLlm: false,
  extraParams: '{}',
  workingDir: process.cwd(),
  autoApproveLimit: 0,
  promptBeforeCommit: false,
  autoStageOnDone: true,
  coreEnginePath: '.',
  pythonPath: '',
  coreApiUrl: '/api/core',
  coreApiToken: '',
  contextFiles: [] as string[],
  sessionEncrypt: false,
  autoSaveSession: false,
  autoLoadSession: false,
  autoSaveSessionName: 'brightvision',
  chatHistoryFile: true,
}

export type E2eVisionConfig = typeof E2E_CONFIG

export const E2E_CONFIG_STORAGE_KEY = 'bright-vision-config'

/** Prime open-project gate skip + config (call before navigation). */
export async function primeVisionAppConfig(page: Page, cfg: E2eVisionConfig) {
  await page.addInitScript(applyOpenProjectStorage, openProjectStorageArgs(cfg.workingDir))
  await page.addInitScript(
    ([config, configKey]) => {
      localStorage.setItem(configKey, JSON.stringify(config))
    },
    [cfg, E2E_CONFIG_STORAGE_KEY] as const
  )
}

export async function primeVisionApp(page: Page) {
  await primeVisionAppConfig(page, E2E_CONFIG)
}

/** Open app with e2e config; install Vision API mocks before navigation (avoids Vite → :8741 proxy noise). */
export async function gotoVision(
  page: Page,
  opts?: { skipCoreMock?: boolean; skipConfigPrime?: boolean }
) {
  if (!opts?.skipConfigPrime) {
    await primeVisionApp(page)
  }
  if (!opts?.skipCoreMock) {
    await installMockCoreApi(page)
  }
  await page.goto('/')
}

export { primeOpenProject }
