import { expect, test } from '@playwright/test'
import { expectOptimisticSend } from './helpers/chatSend'
import {
  assertOllamaForLlmE2e,
  buildLlmE2eConfig,
  isLlmE2eEnabled,
  resolveOllamaTagWithFallback,
  resolveVisionModel,
  visionModelFromTag,
} from './helpers/llmEnv'
import { openChat } from './helpers/session'
import { E2E_CONFIG_STORAGE_KEY } from './helpers/testConfig'

test.describe.configure({ mode: 'serial' })

test.describe('Hello LLM (real Ollama + Vision core)', () => {
  test.skip(!isLlmE2eEnabled(), 'Set E2E_LLM=1 and run: yarn test:e2e:llm')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
  })

  test('hello turn completes with assistant text (no stall)', async ({ page }) => {
    const cfg = {
      ...buildLlmE2eConfig(),
      model: visionModelFromTag(await resolveOllamaTagWithFallback()),
    }
    await page.addInitScript(
      ([key, config]) => {
        localStorage.setItem('vision-welcome-dismissed', '1')
        localStorage.setItem(key, JSON.stringify(config))
      },
      [E2E_CONFIG_STORAGE_KEY, cfg] as const
    )

    await page.goto('/')
    await page.getByTestId('nav-terminal').click()
    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 120_000,
    })

    await openChat(page)
    const prompt = 'Reply with exactly: hello from e2e'
    await page.getByTestId('chat-input').fill(prompt)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, prompt)

    const assistant = page.getByTestId('chat-message-assistant').first()
    await expect(assistant).toBeVisible({ timeout: 240_000 })
    const reply = (await assistant.innerText()).trim()
    expect(reply.length, 'assistant reply should not be empty').toBeGreaterThan(3)

    await expect(page.getByText(/Turn stalled/i)).toHaveCount(0)
    await expect(page.getByText(/likely stuck/i)).toHaveCount(0)

    await expect(page.getByTestId('vision-activity')).toHaveCount(0, { timeout: 60_000 })
    await expect(page.getByTestId('chat-send')).toBeEnabled({ timeout: 30_000 })
  })
})

test.describe('Hello LLM metadata', () => {
  test('documents resolved model for operators', () => {
    test.skip(!isLlmE2eEnabled())
    expect(resolveVisionModel() || 'ollama_chat/x').toMatch(/^ollama_chat\//)
  })
})
