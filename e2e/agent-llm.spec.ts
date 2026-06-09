import { expect, test } from '@playwright/test'
import { expectOptimisticSend } from './helpers/chatSend'
import { expectLatestAssistantSettled, expectNoAgentVerboseCrash } from './helpers/llmChat'
import {
  assertOllamaForLlmE2e,
  ensureLlmE2eWorkspace,
  isLlmE2eEnabled,
} from './helpers/llmEnv'
import { openLlmChat, primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'
import { settleTurnAfterReply } from './helpers/llmTurn'

// Session (120s) + slash/agent preproc (300s default) + reply + turn idle — keep headroom.
// retries: a transient stall/cold-load can still abort a turn; one retry is cheap insurance.
test.describe.configure({ mode: 'serial', timeout: 900_000, retries: 1 })

const AGENT_PROMPT =
  '/agent Reply with exactly: hello from agent e2e. Do not run shell commands, do not edit files, do not use tools.'

const AGENT_REPLY = /hello from agent e2e/i

test.describe('Agent slash (real Ollama + Vision API)', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm (sets E2E_LLM=1 and E2E_OLLAMA_MODEL)')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    ensureLlmE2eWorkspace()
  })

  test('/agent turn completes without verbose AttributeError', async ({ page }) => {
    const cfg = await primeLlmE2eApp(page)
    await startLlmE2eSession(page)
    await openLlmChat(page)

    await page.getByTestId('chat-input').fill(AGENT_PROMPT)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, AGENT_PROMPT)

    // Align with VISION_SLASH_PREPROC_TIMEOUT_S (default 300s) + model latency.
    const replyTimeoutMs = 360_000

    const activity = page.getByTestId('vision-activity')
    let assistant
    try {
      await expectNoAgentVerboseCrash(page)
      // Contract: the /agent turn completes cleanly with a non-empty reply. The exact
      // wording is not guaranteed on small local models (they may paraphrase or emit a
      // tool-call), so the literal phrase is recorded as a soft annotation below.
      assistant = await expectLatestAssistantSettled(page, replyTimeoutMs)
    } catch (err) {
      const activityText = (await activity.innerText().catch(() => '')).trim()
      const toolText = await page
        .getByTestId('chat-tool-output')
        .allInnerTexts()
        .catch(() => [])
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}\n` +
          `Activity: ${activityText || '(none)'}\n` +
          `Tool output: ${toolText.join(' | ') || '(none)'}\n` +
          `Ollama: ${cfg.ollamaApiBase} · model: ${cfg.model}`
      )
    }

    const reply = (await assistant.innerText()).trim()
    expect(reply.length, 'assistant reply should not be empty').toBeGreaterThan(3)
    expect(reply.toLowerCase()).not.toContain("object has no attribute 'verbose'")
    if (!AGENT_REPLY.test(reply)) {
      test.info().annotations.push({
        type: 'note',
        description: `Model did not echo the exact phrase (3b paraphrase/tool-call). Reply: ${reply.slice(0, 200)}`,
      })
    }

    await expect(page.getByText(/Turn stalled/i)).toHaveCount(0)
    await expect(page.getByText(/Slash commands.*timed out/i)).toHaveCount(0)
    // /agent runs inside slash preproc; assistant text can appear long before SSE `done`.
    await settleTurnAfterReply(page, replyTimeoutMs, {
      allowPostAnswerSettle: true,
      postAnswerGraceMs: 45_000,
    })
    await page.getByTestId('chat-input').fill('agent follow-up probe')
    // After allowPostAnswerSettle, the turn may still be busy (showing Queue) or idle (showing Send).
    const sendOrQueue = page.getByTestId('chat-send').or(page.getByTestId('chat-queue'))
    await expect(sendOrQueue).toBeEnabled({ timeout: 30_000 })
  })
})
