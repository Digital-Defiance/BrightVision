import { expect, test } from '@playwright/test'
import { startMockSession } from './helpers/session'

const baseLocalLlmSnapshot = {
  sources: ['mock/local-llm.env'],
  ollamaHost: 'http://127.0.0.1:11434',
  dataModel: 'test/model',
  llmMode: null,
  fastModel: null,
  codeModel: null,
  heavyModel: null,
  thinkModel: null,
  modelRouter: null,
  fastThink: null,
  codeThink: null,
  repoLocalLlmRoot: null,
  tierSlots: [],
  priorityList: [],
  modelPriorityRaw: null,
  warnings: [],
  preferWarm: null,
}

test.describe('Local LLM backend UI (REQ-004)', () => {
  test('vllm backend hides pull and shows Managed externally', async ({ page }) => {
    await startMockSession(page, {
      tauri: {
        handlers: {
          read_local_llm_config: async () => ({
            ...baseLocalLlmSnapshot,
            backend: 'vllm',
          }),
          ollama_models_snapshot: async () => ({
            ollamaHost: 'http://127.0.0.1:11434',
            reachable: false,
            configuredTag: 'test/model',
            configuredInPs: false,
            tagsText: '(model listing managed externally for this backend)',
            psText: '(VRAM / loaded models managed externally)',
            psRows: [],
            tagsRows: [],
          }),
        },
      },
    })
    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('local-llm-managed-externally')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByTestId('local-llm-start')).toHaveCount(0)
    await expect(page.getByTestId('ollama-models-snapshot')).toHaveCount(0)
  })

  test('backend IPC timeout shows unavailable banner and disables controls', async ({ page }) => {
    await startMockSession(page, {
      tauri: {
        handlers: {
          read_local_llm_config: async () => {
            await new Promise((resolve) => setTimeout(resolve, 2500))
            return { ...baseLocalLlmSnapshot, backend: 'ollama' }
          },
        },
      },
    })
    await page.getByTestId('nav-settings').click()
    const banner = page.getByTestId('local-llm-backend-unavailable')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await expect(banner).toContainText('Backend unavailable')
    await expect(page.getByTestId('local-llm-start')).toBeDisabled()
  })
})
