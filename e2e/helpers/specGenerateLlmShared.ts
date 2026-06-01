import { expect, type Page } from '@playwright/test'
import { assertOllamaForLlmE2e, ensureLlmE2eWorkspace } from './llmEnv'
import { restartRealCoreServer } from './realCoreServer'
import { selectTodoTemplate } from './session'
import { specGenTimeoutMs } from './specGenerate'

export const SPEC_GEN_MS = specGenTimeoutMs()
export const LAYER_WAIT_MS = Math.min(180_000, SPEC_GEN_MS)

export async function createEmptySpecTask(page: Page) {
  await selectTodoTemplate(page, 'spec-driven')
  await page.getByTestId('todo-new').click()
  const newRow = page.getByText(/Task \d+/).first()
  await expect(newRow).toBeVisible({ timeout: 10_000 })
  await newRow.click()
  await expect(page.getByTestId('todo-generate-spec-wizard')).toBeEnabled({ timeout: 15_000 })
  await expect(page.getByTestId('todo-generate-spec-wizard')).toHaveText('Generate requirements')
}

export function specGenerateLlmHooks() {
  return {
    beforeAll: async () => {
      await assertOllamaForLlmE2e()
      ensureLlmE2eWorkspace()
    },
    afterEach: async () => {
      await restartRealCoreServer()
    },
  }
}
