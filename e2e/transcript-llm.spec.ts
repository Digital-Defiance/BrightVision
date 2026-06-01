import { expect, test } from '@playwright/test'
import { expectOptimisticSend, expectTurnIdle } from './helpers/chatSend'
import { captureSessionIdOnUiStart, fetchSessionTranscript } from './helpers/llmApi'
import { assertOllamaForLlmE2e, isLlmE2eEnabled } from './helpers/llmEnv'
import { restartRealCoreServer } from './helpers/realCoreServer'
import { ensureHelloLlmE2eWorkspace } from './helpers/fixtureWorkspaces'
import { openLlmChat, primeLlmE2eApp } from './helpers/llmSession'
import { settleTurnAfterReply } from './helpers/llmTurn'

test.describe.configure({ mode: 'serial', timeout: 900_000 })

test.describe('LLM session transcript @transcript', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    ensureHelloLlmE2eWorkspace()
  })

  test.beforeEach(async () => {
    await restartRealCoreServer()
  })

  test('GET /transcript includes user and assistant after a turn', async ({ page }) => {
    const workspace = ensureHelloLlmE2eWorkspace()
    await primeLlmE2eApp(page, { workingDir: workspace })

    await page.goto('/')
    await page.getByTestId('nav-terminal').click()

    const sessionId = await captureSessionIdOnUiStart(page, async () => {
      await page.getByTestId('terminal-start').click()
    })
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 120_000,
    })

    await openLlmChat(page)
    const prompt = 'Reply with exactly: transcript e2e ok'
    await page.getByTestId('chat-input').fill(prompt)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, prompt)
    await settleTurnAfterReply(page, 360_000)

    const rows = await fetchSessionTranscript(sessionId)
    const roles = rows.map((r) => r.role)
    expect(roles).toContain('user')
    expect(roles).toContain('assistant')
    const joined = rows.map((r) => r.content).join(' ').toLowerCase()
    expect(joined).toContain('transcript')
  })
})
