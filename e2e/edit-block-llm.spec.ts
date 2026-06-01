import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { expectOptimisticSend, expectTurnIdle } from './helpers/chatSend'
import {
  E2E_EDIT_BLOCK_REL,
  ensureEditBlockWorkspace,
} from './helpers/fixtureWorkspaces'
import { expectLatestAssistantReply } from './helpers/llmChat'
import { assertOllamaForLlmE2e, isLlmE2eEnabled } from './helpers/llmEnv'
import { openLlmChat, primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'
import { settleTurnAfterReply } from './helpers/llmTurn'

test.describe.configure({ mode: 'serial', timeout: 900_000 })

test.describe('LLM proposed edit block @edit', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    ensureEditBlockWorkspace()
  })

  test('/add patchme.ts then emits SEARCH/REPLACE mentioning new', async ({ page }) => {
    const workspace = ensureEditBlockWorkspace()
    await primeLlmE2eApp(page, { workingDir: workspace })
    await startLlmE2eSession(page)
    await openLlmChat(page)

    const addCmd = `/add ${E2E_EDIT_BLOCK_REL}`
    await page.getByTestId('chat-input').fill(addCmd)
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('chat-tool-output')).toContainText(
      `Added ${E2E_EDIT_BLOCK_REL}`,
      { timeout: 120_000 }
    )
    await expectTurnIdle(page, 120_000)

    const prompt = [
      `In ${E2E_EDIT_BLOCK_REL}, change the string 'old' to 'new' in the export.`,
      'Reply with a single fenced SEARCH/REPLACE block only (no shell, no other files).',
    ].join(' ')
    await page.getByTestId('chat-input').fill(prompt)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, prompt)
    await expectLatestAssistantReply(page, /SEARCH|REPLACE|<<<<<<</i, 360_000)
    await settleTurnAfterReply(page, 180_000)

    const patchPath = path.join(workspace, E2E_EDIT_BLOCK_REL)
    const disk = fs.readFileSync(patchPath, 'utf8')
    const assistantText = await page.getByTestId('chat-message-assistant').last().innerText()
    const proposedOnDisk = disk.includes("'new'")
    const proposedInChat = /new/i.test(assistantText)
    expect(
      proposedOnDisk || proposedInChat,
      'expected SEARCH/REPLACE in chat and/or file updated on disk'
    ).toBe(true)
  })
})
