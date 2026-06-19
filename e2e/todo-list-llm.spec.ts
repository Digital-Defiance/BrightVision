import { expect, test } from '@playwright/test'
import { expectOptimisticSend } from './helpers/chatSend'
import { expectNoAgentVerboseCrash } from './helpers/llmChat'
import { assertOllamaForLlmE2e, isLlmE2eEnabled, recoverLocalLlmForTests } from './helpers/llmEnv'
import { restartRealCoreServer } from './helpers/realCoreServer'
import { ensureHelloLlmE2eWorkspace } from './helpers/fixtureWorkspaces'
import { openLlmChat, primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'
import { settleTurnAfterReply } from './helpers/llmTurn'
import {
  clearHelloWorkspaceAgentArtifacts,
  E2E_TODO_MAGIC,
  workspaceHasAgentTodoMagic,
} from './helpers/todoAgentFile'

test.describe.configure({ mode: 'serial', timeout: 1_200_000, retries: 1 })

const TODO_AGENT_PROMPT = [
  '/agent You must call the UpdateTodoList tool exactly once and no other tools.',
  `tasks parameter: [{"task": "${E2E_TODO_MAGIC}", "done": false, "current": true}].`,
  'Do not run shell commands, do not edit files, do not use EditText, SearchReplace, or Read.',
].join(' ')

/** /agent + tool call on fast tier — often 6–10+ min (see docs/TESTING.md). */
const AGENT_TURN_TIMEOUT_MS = 600_000

async function assertTodoMagicDelivered(
  page: import('@playwright/test').Page,
  workspace: string
): Promise<void> {
  await expect(async () => {
    if (workspaceHasAgentTodoMagic(workspace)) return
    const toolOutput = await page.getByTestId('chat-tool-output').allInnerTexts()
    const combined = toolOutput.join('\n').toLowerCase()
    const toolRan =
      combined.includes('updatetodolist') ||
      combined.includes('update todo') ||
      combined.includes(E2E_TODO_MAGIC)
    if (toolRan && combined.includes(E2E_TODO_MAGIC)) return
    throw new Error(
      `expected ${E2E_TODO_MAGIC} in .cecli/agents/.../todo.txt (or tool output); tools: ${
        toolOutput.join(' | ') || '(none)'
      }`
    )
  }).toPass({ timeout: 120_000 })
}

test.describe('LLM UpdateTodoList @todo', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    ensureHelloLlmE2eWorkspace()
  })

  test.beforeEach(async () => {
    await restartRealCoreServer()
    if (process.env.BV_TEST_SUITE_ACTIVE === '1') {
      try {
        recoverLocalLlmForTests()
      } catch {
        /* recover LM Studio after prior heavy /agent e2e in Lab */
      }
    }
  })

  test('writes magic task to agent todo.txt', async ({ page }) => {
    const workspace = ensureHelloLlmE2eWorkspace()
    clearHelloWorkspaceAgentArtifacts(workspace)

    let lastErr: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        clearHelloWorkspaceAgentArtifacts(workspace)
        try {
          recoverLocalLlmForTests()
        } catch {
          /* retry after wedge */
        }
        await restartRealCoreServer()
      }

      await primeLlmE2eApp(page, { workingDir: workspace, autoApproveLimit: 25 })
      await startLlmE2eSession(page)
      await openLlmChat(page)

      await page.getByTestId('chat-input').fill(TODO_AGENT_PROMPT)
      await page.getByTestId('chat-send').click()
      await expectOptimisticSend(page, TODO_AGENT_PROMPT)
      try {
        await settleTurnAfterReply(page, AGENT_TURN_TIMEOUT_MS)
        await expectNoAgentVerboseCrash(page)
        await assertTodoMagicDelivered(page, workspace)
        const sendOrQueue = page.getByTestId('chat-send').or(page.getByTestId('chat-queue'))
        await expect(sendOrQueue).toBeEnabled({ timeout: 60_000 })
        return
      } catch (err) {
        lastErr = err
        if (attempt === 1) break
      }
    }
    throw lastErr
  })
})
