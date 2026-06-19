import path from 'node:path'
import { expect, test } from '@playwright/test'
import { IMPLEMENT_NAMED_PATH_NUDGE } from './helpers/implementFixture'
import { ensureImplementWorkspace } from './helpers/fixtureWorkspaces'
import { expectNoAgentVerboseCrash } from './helpers/llmChat'
import {
  assertDeliverableOrToolActivity,
  assertNoImplementTurnErrors,
  clickImplementOnStep,
  IMPLEMENT_AGENT_TURN_TIMEOUT_MS,
  IMPLEMENT_SPEC_TIMEOUT_MS,
  selectImplementTask,
  sendPrefilledImplementChat,
  waitForImplementTurnSettled,
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

test.describe.configure({ mode: 'serial', timeout: IMPLEMENT_SPEC_TIMEOUT_MS, retries: 2 })

test.describe('Implement turn (real LLM + Vision API) @implement', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    warmCodeModelForImplementE2e()
  })

  test.beforeEach(async () => {
    await restartRealCoreServer()
  })

  test('Tasks implement step creates or edits named path with code model', async ({ page }) => {
    const workspace = ensureImplementWorkspace('named-path')
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
    await assertDeliverableOrToolActivity(
      page,
      TOKEN_REL,
      tokenPath,
      IMPLEMENT_AGENT_TURN_TIMEOUT_MS
    )
    await assertNoImplementTurnErrors(page)
    await waitForImplementTurnSettled(page, IMPLEMENT_AGENT_TURN_TIMEOUT_MS)
    const sendOrQueue = page.getByTestId('chat-send').or(page.getByTestId('chat-queue'))
    await expect(sendOrQueue).toBeEnabled({ timeout: 60_000 })
  })
})
