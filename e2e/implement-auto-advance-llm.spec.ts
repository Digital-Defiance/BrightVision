import path from 'node:path'
import { expect, test } from '@playwright/test'
import { IMPLEMENT_NAMED_PATH_NUDGE } from './helpers/implementFixture'
import { ensureImplementWorkspace } from './helpers/fixtureWorkspaces'
import { expectNoAgentVerboseCrash } from './helpers/llmChat'
import {
  assertNoImplementTurnErrors,
  clickImplementOnStep,
  IMPLEMENT_AGENT_TURN_TIMEOUT_MS,
  IMPLEMENT_SPEC_TIMEOUT_MS,
  selectImplementTask,
  sendPrefilledImplementChat,
  waitForImplementAutoAdvanceTurn,
} from './helpers/implementLlmShared'
import {
  assertOllamaForLlmE2e,
  isLlmE2eEnabled,
  resolveCodeVisionModel,
  warmCodeModelForImplementE2e,
} from './helpers/llmEnv'
import { restartRealCoreServer } from './helpers/realCoreServer'
import { primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'

const TOKEN_REL = 'src/auth/token.ts'

test.describe.configure({
  mode: 'serial',
  timeout: IMPLEMENT_SPEC_TIMEOUT_MS,
  retries: process.env.BV_TEST_SUITE_ACTIVE === '1' ? 0 : 1,
})

test.describe('Implement auto-advance (real LLM + Vision API) @implement', () => {
  test.skip(
    !isLlmE2eEnabled() || process.env.E2E_IMPLEMENT_AUTO_ADVANCE_LLM !== '1',
    'Opt-in: E2E_IMPLEMENT_AUTO_ADVANCE_LLM=1 (Lab checkbox “Implement auto-advance LLM” or yarn test:e2e:llm implement-auto-advance-llm.spec.ts)'
  )

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    warmCodeModelForImplementE2e()
  })

  test.beforeEach(async () => {
    await restartRealCoreServer()
  })

  test('Step 2 verify passes and auto-advances to step 3', async ({ page }) => {
    const workspace = ensureImplementWorkspace('named-path-auto-advance')
    const tokenPath = path.join(workspace, TOKEN_REL)

    const codeModel = resolveCodeVisionModel()
    await primeLlmE2eApp(page, { workingDir: workspace, model: codeModel, autoApproveLimit: 25 })
    await startLlmE2eSession(page)
    await selectImplementTask(page)
    await clickImplementOnStep(page, /2\. Implement auth token/)

    await sendPrefilledImplementChat(page, {
      expectInInput: [/\/agent Implement only implementation task 2:/, /src\/auth\/token\.ts/],
      expectInUserBubble: [/\/agent Implement only implementation task 2:/, /src\/auth\/token\.ts/],
      appendText: IMPLEMENT_NAMED_PATH_NUDGE,
    })

    await expectNoAgentVerboseCrash(page)
    await waitForImplementAutoAdvanceTurn(
      page,
      TOKEN_REL,
      tokenPath,
      3,
      IMPLEMENT_AGENT_TURN_TIMEOUT_MS
    )
    await assertNoImplementTurnErrors(page)

    // Nested step 3 can run 10+ min — stop after auto-advance signal is visible.
    const stop = page.getByTestId('chat-stop-turn')
    if (await stop.count()) {
      await stop.click()
      await expect(stop).toHaveCount(0, { timeout: 120_000 })
    }
  })
})
