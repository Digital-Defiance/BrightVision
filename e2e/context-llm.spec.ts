import { expect, test } from '@playwright/test'
import { expectOptimisticSend, expectTurnIdle } from './helpers/chatSend'
import {
  E2E_CONTEXT_MAGIC,
  E2E_CONTEXT_WIDGET_REL,
  ensureContextLlmE2eWorkspace,
} from './helpers/contextWorkspace'
import { expectLatestAssistantReply } from './helpers/llmChat'
import { assertOllamaForLlmE2e, isLlmE2eEnabled } from './helpers/llmEnv'
import { openLlmChat, primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'
import { settleTurnAfterReply } from './helpers/llmTurn'

test.describe.configure({ mode: 'serial', timeout: 900_000 })

test.describe('LLM context (/add file in fixture repo)', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm (E2E_LLM=1)')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    ensureContextLlmE2eWorkspace()
  })

  test('reads E2E_CONTEXT_MAGIC from added src/e2e_widget.ts', async ({ page }) => {
    const workspace = ensureContextLlmE2eWorkspace()
    const cfg = await primeLlmE2eApp(page, { workingDir: workspace })
    await startLlmE2eSession(page)
    await openLlmChat(page)

    const addCmd = `/add ${E2E_CONTEXT_WIDGET_REL}`
    await page.getByTestId('chat-input').fill(addCmd)
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('chat-input')).toHaveValue('', { timeout: 10_000 })
    await expect(page.getByTestId('chat-tool-output')).toContainText(
      `Added ${E2E_CONTEXT_WIDGET_REL} to the chat`,
      { timeout: 120_000 }
    )
    await expect(page.getByTestId('session-context-chip')).toContainText('1 file', {
      timeout: 120_000,
    })
    await expectTurnIdle(page, 120_000)

    const question =
      'Using only the file you have in context, what is the exact string value assigned to ' +
      'E2E_CONTEXT_MAGIC in TypeScript? Reply with only that string, no quotes or explanation.'
    await page.getByTestId('chat-input').fill(question)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, question)

    const activity = page.getByTestId('vision-activity')
    try {
      await expectLatestAssistantReply(page, new RegExp(E2E_CONTEXT_MAGIC), 360_000)
    } catch (err) {
      const activityText = (await activity.innerText().catch(() => '')).trim()
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}\n` +
          `Expected magic: ${E2E_CONTEXT_MAGIC}\n` +
          `Activity: ${activityText || '(none)'}\n` +
          `Ollama: ${cfg.ollamaApiBase} · model: ${cfg.model}`
      )
    }

    await settleTurnAfterReply(page, 180_000)
  })
})
