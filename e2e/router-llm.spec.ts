import { expect, test } from '@playwright/test'
import { expectOptimisticSend } from './helpers/chatSend'
import {
  assertOllamaForLlmE2e,
  ensureOllamaModelPulled,
  ensureLlmE2eWorkspace,
  isLlmE2eEnabled,
  isRouterLlmE2eEnabled,
  resolveRouterModelTags,
} from './helpers/llmEnv'
import { expectLatestAssistantReply } from './helpers/llmChat'
import { openLlmChat, primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'
import { settleRouterTurnAfterReply } from './helpers/llmTurn'

test.describe.configure({ mode: 'serial', timeout: 900_000 })

/** Prefer idle; after reply + chip, allow post-answer settle (router may lag on SSE `done`). */
const ROUTER_SETTLE_MS = 180_000

test.describe('LLM auto-router @router', () => {
  test.skip(!isLlmE2eEnabled(), 'Run with E2E_LLM=1')
  test.skip(!isRouterLlmE2eEnabled(), 'Run with E2E_MODEL_ROUTER=1')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    ensureLlmE2eWorkspace()
    const { fastTag, heavyTag } = resolveRouterModelTags()
    if (!fastTag) {
      throw new Error(
        'Router e2e requires FAST_MODEL or E2E_FAST_MODEL (see local-llm.env / docs/TESTING.md)'
      )
    }
    if (!heavyTag) {
      throw new Error(
        'Router e2e requires HEAVY_MODEL or E2E_HEAVY_MODEL distinct from the fast tier'
      )
    }
    if (fastTag === heavyTag) {
      throw new Error(`Router e2e requires different fast and heavy models (both ${fastTag})`)
    }
    await ensureOllamaModelPulled(fastTag)
    await ensureOllamaModelPulled(heavyTag)
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
    await expect(page.getByTestId('model-router-chip')).toContainText('Fighter pilot', {
      timeout: 240_000,
    })
    await expectLatestAssistantReply(page, /begin|start|run|button|label|response/i, 360_000)
    await settleRouterTurnAfterReply(page, ROUTER_SETTLE_MS)
  })

  test('heavy tier routes to Engineer', async ({ page }) => {
    await primeLlmE2eApp(page)
    await startLlmE2eSession(page)
    await openLlmChat(page)

    const heavyPrompt =
      'In 3–5 sentences, name two architecture risks for a minimal HTTP health API. No file edits.'
    await page.getByTestId('chat-input').fill(heavyPrompt)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, heavyPrompt)
    await expect(page.getByTestId('model-router-chip')).toContainText('Engineer', {
      timeout: 240_000,
    })
    await expectLatestAssistantReply(
      page,
      /architecture|risk|security|migration|scal|health|api|response/i,
      360_000
    )
    await settleRouterTurnAfterReply(page, ROUTER_SETTLE_MS)
  })
})
