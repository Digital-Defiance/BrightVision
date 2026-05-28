import { expect, test } from '@playwright/test'
import { expectOptimisticSend, expectTurnIdle } from './helpers/chatSend'
import { expectNoAgentVerboseCrash } from './helpers/llmChat'
import { assertOllamaForLlmE2e, isLlmE2eEnabled } from './helpers/llmEnv'
import { ensureHelloLlmE2eWorkspace } from './helpers/fixtureWorkspaces'
import { openLlmChat, primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'
import { settleTurnAfterReply } from './helpers/llmTurn'
import { E2E_TODO_MAGIC, workspaceHasAgentTodoMagic } from './helpers/todoAgentFile'

test.describe.configure({ mode: 'serial', timeout: 1_200_000 })

const TODO_AGENT_PROMPT = [
  '/agent You must call the UpdateTodoList tool exactly once and no other tools.',
  `tasks parameter: [{"task": "${E2E_TODO_MAGIC}", "done": false, "current": true}].`,
  'Do not run shell commands, do not edit files, do not use SearchReplace or Read.',
].join(' ')

/** /agent + tool call on fast tier — often 6–10+ min (see docs/TESTING.md). */
const AGENT_TURN_TIMEOUT_MS = 600_000

test.describe('LLM UpdateTodoList @todo', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    ensureHelloLlmE2eWorkspace()
  })

  test('writes magic task to agent todo.txt', async ({ page }) => {
    const workspace = ensureHelloLlmE2eWorkspace()
    await primeLlmE2eApp(page, { workingDir: workspace, autoApproveLimit: 25 })
    await startLlmE2eSession(page)
    await openLlmChat(page)

    await page.getByTestId('chat-input').fill(TODO_AGENT_PROMPT)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, TODO_AGENT_PROMPT)
    await settleTurnAfterReply(page, AGENT_TURN_TIMEOUT_MS)
    await expectNoAgentVerboseCrash(page)

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
    }).toPass({ timeout: 60_000 })

    await expectTurnIdle(page, 30_000)
  })
})
