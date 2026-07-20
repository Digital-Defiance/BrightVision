import { expect, test } from '@playwright/test'
import {
  assertOllamaForLlmE2e,
  clearLlmE2eWorkspaceTodos,
  ensureOllamaModelPulled,
  ensureLlmE2eWorkspace,
  isLlmE2eEnabled,
  isRouterLlmE2eEnabled,
  resolveRouterModelTags,
  warmLocalLlmModelTag,
} from './helpers/llmEnv'
import { expectOptimisticSend } from './helpers/chatSend'
import { expectLatestAssistantReply } from './helpers/llmChat'
import { openLlmChat, primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'
import { settleRouterTurnAfterReply } from './helpers/llmTurn'

test.describe.configure({ mode: 'serial', timeout: 900_000 })

/** Prefer idle; after reply + chip, allow post-answer settle (router may lag on SSE `done`). */
const ROUTER_SETTLE_MS = 180_000

test.describe('LLM auto-router @router', () => {
  test.skip(!isLlmE2eEnabled(), 'Run with E2E_LLM=1')
  test.skip(!isRouterLlmE2eEnabled(), 'Run with E2E_MODEL_ROUTER=1')

  test.beforeEach(() => {
    // Spec-gen / todo-list share hello-workspace; session start re-imports agent todo.txt
    // and re-activates tasks unless the whole `.cecli/` tree is removed.
    clearLlmE2eWorkspaceTodos()
  })

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    ensureLlmE2eWorkspace()
    const { fastTag, codeTag, thinkTag } = resolveRouterModelTags()
    if (!fastTag) {
      throw new Error(
        'Router e2e requires FAST_MODEL or E2E_FAST_MODEL (see local-llm.env / docs/TESTING.md)'
      )
    }
    if (!codeTag) {
      throw new Error(
        'Router e2e requires CODE_MODEL, HEAVY_MODEL, or E2E_CODE_MODEL distinct from the fast tier'
      )
    }
    if (fastTag === codeTag) {
      throw new Error(`Router e2e requires different fast and code models (both ${fastTag})`)
    }
    await ensureOllamaModelPulled(fastTag)
    await ensureOllamaModelPulled(codeTag)
    if (thinkTag) {
      await ensureOllamaModelPulled(thinkTag)
    }
  })

  test('fast tier routes to Fighter pilot', async ({ page }) => {
    await primeLlmE2eApp(page)
    await startLlmE2eSession(page)
    await openLlmChat(page)

    const fastPrompt =
      'Suggest a better button label than "Start" in one sentence only. No code blocks, no file edits.'
    await page.getByTestId('chat-input').fill(fastPrompt)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, fastPrompt)
    const assistantBubble = page.getByTestId('chat-message-assistant').last()
    try {
      await expect(assistantBubble).toHaveAttribute('data-model-route-tier', 'fast', {
        timeout: 240_000,
      })
    } catch (err) {
      const tier = await assistantBubble.getAttribute('data-model-route-tier').catch(() => null)
      const reasons = await assistantBubble
        .getAttribute('data-model-route-reasons')
        .catch(() => null)
      const escalated = await assistantBubble
        .getAttribute('data-model-route-escalated')
        .catch(() => null)
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}\n` +
          `Resolved tier: ${tier ?? '(none)'} · reasons: ${reasons ?? '(none)'} · escalated: ${escalated ?? 'false'}`
      )
    }
    await expectLatestAssistantReply(page, /begin|start|run|button|label|response/i, 360_000)
    await settleRouterTurnAfterReply(page, ROUTER_SETTLE_MS)
  })

  test('code tier routes to Engineer on implement-style prompt', async ({ page }) => {
    await primeLlmE2eApp(page)
    await startLlmE2eSession(page)
    await openLlmChat(page)

    const codePrompt =
      'Implement a minimal health-check handler in pseudocode only (5 lines max). No file edits, no tools.'
    await page.getByTestId('chat-input').fill(codePrompt)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, codePrompt)
    await expect(page.getByTestId('chat-message-assistant').last()).toHaveAttribute(
      'data-model-route-tier',
      'code',
      { timeout: 240_000 }
    )
    await expectLatestAssistantReply(page, /health|handler|check|http|status|response/i, 360_000)
    await settleRouterTurnAfterReply(page, ROUTER_SETTLE_MS)
  })

  test('think tier routes to Architect when THINK_MODEL configured', async ({ page }) => {
    const { thinkTag } = resolveRouterModelTags()
    test.skip(!thinkTag, 'Set THINK_MODEL in local-llm.env for think-tier router e2e')

    // LM Studio: global setup keeps fast+code resident; exclusive-load think so 70B fits in RAM.
    warmLocalLlmModelTag(thinkTag, { exclusive: true })

    await primeLlmE2eApp(page)
    await startLlmE2eSession(page)
    await openLlmChat(page)

    const thinkPrompt =
      'In 3–5 sentences, name two architecture risks for a minimal HTTP health API. No file edits.'
    await page.getByTestId('chat-input').fill(thinkPrompt)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, thinkPrompt)
    await expect(page.getByTestId('chat-message-assistant').last()).toHaveAttribute(
      'data-model-route-tier',
      'think',
      { timeout: 240_000 }
    )
    await expectLatestAssistantReply(
      page,
      /architecture|risk|security|migration|scal|health|api|response/i,
      360_000
    )
    await settleRouterTurnAfterReply(page, ROUTER_SETTLE_MS)
  })
})
