import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { IMPLEMENT_RESUME_NUDGE } from './helpers/implementFixture'
import { ensureImplementWorkspace } from './helpers/fixtureWorkspaces'
import { expectNoAgentVerboseCrash } from './helpers/llmChat'
import {
  assertDeliverableOnDisk,
  assertDeliverableOrToolActivity,
  assertNoImplementTurnErrors,
  clickResumeWork,
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

const HANDLER_TEST_REL = 'src/api/handler.test.ts'

test.describe.configure({ mode: 'serial', timeout: IMPLEMENT_SPEC_TIMEOUT_MS, retries: 2 })

test.describe('Implement resume (real LLM + Vision API) @implement', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    warmCodeModelForImplementE2e()
  })

  test.beforeEach(async () => {
    await restartRealCoreServer()
  })

  test('Resume work creates handler tests with code model', async ({ page }) => {
    const workspace = ensureImplementWorkspace('resume')
    const handlerTestPath = path.join(workspace, HANDLER_TEST_REL)
    expect(fs.existsSync(handlerTestPath)).toBe(false)

    const codeModel = resolveCodeVisionModel()
    await primeLlmE2eApp(page, { workingDir: workspace, model: codeModel, autoApproveLimit: 25 })
    await startLlmE2eSession(page)
    await selectImplementTask(page)
    await clickResumeWork(page)

    await sendPrefilledImplementChat(page, {
      expectInInput: [/\/agent Continue the active task/, /workspace snapshot/],
      expectInUserBubble: [/\/agent Continue the active task/],
      appendText: IMPLEMENT_RESUME_NUDGE,
    })

    await expectNoAgentVerboseCrash(page)
    await assertDeliverableOrToolActivity(
      page,
      HANDLER_TEST_REL,
      handlerTestPath,
      IMPLEMENT_AGENT_TURN_TIMEOUT_MS
    )
    await waitForImplementTurnSettled(page, IMPLEMENT_AGENT_TURN_TIMEOUT_MS)
    await assertDeliverableOnDisk(
      page,
      HANDLER_TEST_REL,
      handlerTestPath,
      IMPLEMENT_AGENT_TURN_TIMEOUT_MS
    )
    await assertNoImplementTurnErrors(page)
    const sendOrQueue = page.getByTestId('chat-send').or(page.getByTestId('chat-queue'))
    await expect(sendOrQueue).toBeEnabled({ timeout: 60_000 })
  })
})
