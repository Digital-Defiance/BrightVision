import { expect, test } from '@playwright/test'
import { expectOptimisticSend } from './helpers/chatSend'
import {
  assertOllamaForLlmE2e,
  ensureLlmE2eWorkspace,
  isLlmE2eEnabled,
  resolveVisionModel,
} from './helpers/llmEnv'
import { openLlmChat, primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'
import { settleTurnAfterReply } from './helpers/llmTurn'

test.describe.configure({ mode: 'serial', timeout: 900_000 })

test.describe('Hello LLM (real Ollama + Vision API)', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm (sets E2E_LLM=1 and E2E_OLLAMA_MODEL)')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    ensureLlmE2eWorkspace()
  })

  test('hello turn completes with assistant text (no stall)', async ({ page }) => {
    const cfg = await primeLlmE2eApp(page)
    await startLlmE2eSession(page)
    await openLlmChat(page)
    const prompt = 'Reply with exactly: hello from e2e'
    await page.getByTestId('chat-input').fill(prompt)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, prompt)

    const assistant = page.getByTestId('chat-message-assistant').first()
    const activity = page.getByTestId('vision-activity')
    try {
      await expect(assistant).toBeVisible({ timeout: 240_000 })
    } catch {
      const activityText = (await activity.innerText().catch(() => '')).trim()
      throw new Error(
        `No assistant message within 240s. Activity: ${activityText || '(none)'}\n` +
          `If you see "network error", check Ollama (${cfg.ollamaApiBase}) and core on :8741.`
      )
    }
    const reply = (await assistant.innerText()).trim()
    expect(reply.length, 'assistant reply should not be empty').toBeGreaterThan(3)

    await expect(page.getByText(/Turn stalled/i)).toHaveCount(0)
    await expect(page.getByText(/likely stuck/i)).toHaveCount(0)

    // Answer can appear before SSE `done` (router / Ollama tail); allow post-answer wait.
    await settleTurnAfterReply(page, 180_000)
    await page.getByTestId('chat-input').fill('follow-up probe')
    await expect(page.getByTestId('chat-send')).toBeEnabled()
  })
})

test.describe('Hello LLM metadata', () => {
  test('documents resolved model for operators', () => {
    test.skip(!isLlmE2eEnabled())
    expect(resolveVisionModel() || 'ollama_chat/x').toMatch(/^ollama_chat\//)
  })
})
