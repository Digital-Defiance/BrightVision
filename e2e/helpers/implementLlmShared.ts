import fs from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { IMPLEMENT_E2E_TITLE } from './implementFixture'
import { isHeavyCodeVisionModel } from './llmEnv'
import { openLlmChat } from './llmSession'
import { openTasks } from './session'
import { settleTurnAfterReply } from './llmTurn'

function resolveImplementTurnTimeoutMs(): number {
  const suiteCap = Number(process.env.BV_SUITE_LLM_TURN_TIMEOUT_S)
  const baseSec = Number.isFinite(suiteCap) && suiteCap > 0 ? suiteCap : 600
  const seconds = isHeavyCodeVisionModel() ? Math.max(baseSec, 1200) : baseSec
  return seconds * 1000
}

/** /agent + ContextManager/EditText on CODE tier — often 6–20+ min on local heavy models. */
export const IMPLEMENT_AGENT_TURN_TIMEOUT_MS = resolveImplementTurnTimeoutMs()

/** Playwright spec timeout: two turn caps + warmup headroom. */
export const IMPLEMENT_SPEC_TIMEOUT_MS = IMPLEMENT_AGENT_TURN_TIMEOUT_MS * 2 + 300_000

function assertNotContextManagerStall(tools: string, onDisk: boolean) {
  const lower = tools.toLowerCase()
  if (onDisk || lower.includes('edittext')) return
  const retries = (tools.match(/Retrying in 0\.2 seconds/gi) || []).length
  if (retries >= 6) {
    throw new Error(
      `ContextManager retry loop (${retries}x) without EditText — ${tools.slice(-2000)}`
    )
  }
}

export async function selectImplementTask(page: Page) {
  await openTasks(page)
  await page.getByTestId('todo-panel').getByRole('button', { name: IMPLEMENT_E2E_TITLE }).click()
  await page.getByTestId('todo-panel').getByRole('tab', { name: 'Tasks' }).click()
}

export async function clickImplementOnStep(page: Page, stepLabel: RegExp) {
  const stepRow = page
    .getByTestId('todo-panel')
    .getByText(stepLabel)
    .locator('..')
    .getByRole('button', { name: 'Implement' })
  await expect(stepRow).toBeEnabled({ timeout: 15_000 })
  const patch = page.waitForResponse(
    (res) =>
      res.request().method() === 'PATCH' &&
      res.url().includes('/api/core/workspaces/todos/') &&
      res.ok()
  )
  await stepRow.click()
  await patch
}

export async function clickResumeWork(page: Page) {
  await page.getByTestId('todo-resume-work').click()
}

export async function sendPrefilledImplementChat(
  page: Page,
  opts: {
    expectInInput?: RegExp[]
    expectInUserBubble?: RegExp[]
    /** Steer small models away from endless ContextManager exploration (pytest parity). */
    appendText?: string
  } = {}
) {
  await openLlmChat(page)
  const input = page.getByTestId('chat-input')
  for (const pattern of opts.expectInInput ?? []) {
    await expect.poll(async () => input.inputValue(), { timeout: 15_000 }).toMatch(pattern)
  }
  if (opts.appendText?.trim()) {
    const current = await input.inputValue()
    await input.fill(`${current.trimEnd()} ${opts.appendText.trim()}`)
  }
  await expect(page.getByTestId('chat-send')).toBeEnabled({ timeout: 15_000 })
  await page.getByTestId('chat-send').click()
  await expect(input).toHaveValue('', { timeout: 15_000 })
  const userBubble = page.getByTestId('chat-message-user').last()
  for (const pattern of opts.expectInUserBubble ?? []) {
    await expect(userBubble).toContainText(pattern, { timeout: 60_000 })
  }
}

/** Auto-advance verify gate needs a real file edit — ContextManager-only is not enough. */
export async function assertDeliverableOnDisk(
  page: Page,
  relPath: string,
  absPath: string,
  timeoutMs = IMPLEMENT_AGENT_TURN_TIMEOUT_MS
) {
  await expect(async () => {
    const onDisk = fs.existsSync(absPath) && fs.readFileSync(absPath, 'utf8').trim().length > 0
    if (onDisk) return
    const toolText = await page.getByTestId('chat-tool-output').allInnerTexts().catch(() => [])
    throw new Error(
      `expected ${relPath} on disk; tools tail: ${toolText.join(' | ').slice(-1500) || '(none)'}`
    )
  }).toPass({ timeout: timeoutMs })
}

export async function assertDeliverableOrToolActivity(
  page: Page,
  relPath: string,
  absPath: string,
  timeoutMs = IMPLEMENT_AGENT_TURN_TIMEOUT_MS
) {
  await expect(async () => {
    const onDisk = fs.existsSync(absPath) && fs.readFileSync(absPath, 'utf8').trim().length > 0
    const toolText = await page.getByTestId('chat-tool-output').allInnerTexts().catch(() => [])
    const toolsJoined = toolText.join('\n')
    const lower = toolsJoined.toLowerCase()
    assertNotContextManagerStall(toolsJoined, onDisk)
    const toolActivity =
      lower.includes('edittext') ||
      (lower.includes('successfully') && onDisk) ||
      lower.includes('contextmanager')
    if (onDisk || toolActivity) return
    throw new Error(
      `expected ${relPath} on disk or EditText/ContextManager tool output; tools: ${
        toolText.join(' | ') || '(none)'
      }`
    )
  }).toPass({ timeout: timeoutMs })
}

/** Auto-advance verify gate needs EditText — ContextManager-only loops do not count. */
export async function assertImplementEditForAutoAdvance(
  page: Page,
  relPath: string,
  absPath: string,
  timeoutMs = IMPLEMENT_AGENT_TURN_TIMEOUT_MS
) {
  await expect(async () => {
    const onDisk = fs.existsSync(absPath) && fs.readFileSync(absPath, 'utf8').trim().length > 0
    const tools = await allToolOutputText(page)
    const lower = tools.toLowerCase()
    assertNotContextManagerStall(tools, onDisk)
    if (onDisk) return
    if (lower.includes('edittext')) return
    throw new Error(
      `expected ${relPath} on disk or EditText for auto-advance; tools tail: ${tools.slice(-1500) || '(none)'}`
    )
  }).toPass({ timeout: timeoutMs })
}

export async function assertNoImplementTurnErrors(page: Page) {
  const toolsJoined = (
    await page.getByTestId('chat-tool-output').allInnerTexts().catch(() => [])
  )
    .join('\n')
    .toLowerCase()
  expect(toolsJoined).not.toContain('yield rejected')
  expect(toolsJoined).not.toContain('skipped auto-advance')
  expect(toolsJoined).not.toContain('verify failed')
  await expect(page.getByText(/Turn stalled/i)).toHaveCount(0)
  await expect(page.getByText(/Slash commands.*timed out/i)).toHaveCount(0)
}

export async function allToolOutputText(page: Page): Promise<string> {
  return (await page.getByTestId('chat-tool-output').allInnerTexts().catch(() => [])).join('\n')
}

export async function waitForImplementTurnSettled(
  page: Page,
  timeoutMs = IMPLEMENT_AGENT_TURN_TIMEOUT_MS
) {
  await settleTurnAfterReply(page, timeoutMs)
}

function assertNoAutoAdvanceBlockers(tools: string) {
  if (/Skipped auto-advance/i.test(tools)) {
    throw new Error(`auto-advance skipped (need EditText edits): ${tools.slice(-2500)}`)
  }
  if (/Verify failed/i.test(tools)) {
    throw new Error(`verify failed: ${tools.slice(-2500)}`)
  }
}

export async function waitForImplementAutoAdvance(
  page: Page,
  nextStep: number | string,
  timeoutMs = IMPLEMENT_AGENT_TURN_TIMEOUT_MS
) {
  const step = String(nextStep)
  await expect(async () => {
    const tools = await allToolOutputText(page)
    assertNoAutoAdvanceBlockers(tools)
    assertNotContextManagerStall(tools, false)
    const users = await page.getByTestId('chat-message-user').allInnerTexts().catch(() => [])
    const userJoined = users.join('\n')
    const advanced =
      new RegExp(`Auto-advancing to step ${step}`, 'i').test(tools) ||
      userJoined.includes(`Implement only implementation task ${step}:`)
    if (advanced) return
    throw new Error(
      `expected auto-advance to step ${step}; tools tail: ${tools.slice(-1500) || '(none)'}`
    )
  }).toPass({ timeout: timeoutMs })
}

/**
 * Verify + auto-advance run at the implement turn tail and may start a nested step
 * before the UI goes idle — poll deliverable + auto-advance without settling first.
 */
export async function waitForImplementAutoAdvanceTurn(
  page: Page,
  relPath: string,
  absPath: string,
  nextStep: number | string,
  timeoutMs = IMPLEMENT_AGENT_TURN_TIMEOUT_MS
) {
  const step = String(nextStep)
  await assertImplementEditForAutoAdvance(page, relPath, absPath, timeoutMs)
  await expect(async () => {
    const tools = await allToolOutputText(page)
    assertNoAutoAdvanceBlockers(tools)
    const onDisk = fs.existsSync(absPath) && fs.readFileSync(absPath, 'utf8').trim().length > 0
    assertNotContextManagerStall(tools, onDisk)
    const users = await page.getByTestId('chat-message-user').allInnerTexts().catch(() => [])
    const userJoined = users.join('\n')
    const advanced =
      new RegExp(`Auto-advancing to step ${step}`, 'i').test(tools) ||
      userJoined.includes(`Implement only implementation task ${step}:`)
    if (advanced) return
    const verifyPassed = new RegExp(`Verify passed.*step`, 'i').test(tools)
    if (onDisk && verifyPassed) {
      throw new Error(
        `verify passed and ${relPath} on disk — waiting for auto-advance; tail: ${tools.slice(-1500)}`
      )
    }
    throw new Error(
      `waiting for verify + auto-advance to step ${step}; tools tail: ${tools.slice(-1500) || '(none)'}`
    )
  }).toPass({ timeout: timeoutMs })
}
