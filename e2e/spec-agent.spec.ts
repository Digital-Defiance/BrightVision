import { expect, test } from '@playwright/test'
import { sampleTodoStore } from './helpers/fixtures'
import { startMockSession } from './helpers/session'

test.describe('Spec agent rail (roadmap #20 E6)', () => {
  test.beforeEach(async ({ page }) => {
    const store = sampleTodoStore()
    store.activeId = 'task-a'
    await startMockSession(page, { initialTodos: store })
  })

  test('Session mode toggle lives on Spec tab', async ({ page }) => {
    await page.getByTestId('nav-spec').click()
    await expect(page.getByTestId('session-mode-toggle')).toBeVisible()
    await page.getByTestId('session-mode-spec').click()
    await expect(page.getByTestId('session-mode-spec')).toHaveAttribute('aria-pressed', 'true')
  })

  test('Spec tab shows panel and active task chip', async ({ page }) => {
    await page.getByTestId('nav-spec').click()
    await expect(page.getByTestId('spec-agent-panel')).toBeVisible()
    await expect(page.getByTestId('spec-agent-active-task')).toContainText('First task')
    await expect(page.getByTestId('spec-agent-empty')).toBeVisible()
  })

  test('Spec send posts message with spec_focus', async ({ page }) => {
    let messageBody: { spec_focus?: boolean; preproc?: boolean } = {}
    await page.route('**/sessions/*/messages', async (route) => {
      if (route.request().method() === 'POST') {
        messageBody = route.request().postDataJSON() as typeof messageBody
        const body = `data: ${JSON.stringify({ type: 'user_message', text: 'hello' })}\n\n`
        const done = `data: ${JSON.stringify({ type: 'done', assistant_text: 'Spec reply' })}\n\n`
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: body + `data: ${JSON.stringify({ type: 'token', text: 'Spec ' })}\n\n` + `data: ${JSON.stringify({ type: 'token', text: 'reply' })}\n\n` + done,
        })
        return
      }
      await route.continue()
    })

    await page.getByTestId('nav-spec').click()
    await page.getByTestId('spec-agent-input').fill('Tighten REQ-001 wording')
    await page.getByTestId('spec-agent-send').click()

    await expect.poll(() => messageBody.spec_focus).toBe(true)
    expect(messageBody.preproc).toBe(false)
    await expect(page.getByTestId('spec-agent-assistant')).toContainText('Spec reply', {
      timeout: 15_000,
    })
  })

  test('Generate uses text from spec input box', async ({ page }) => {
    let generateBody: { prompt?: string; mode?: string } = {}
    await page.route(
      (url) => /\/workspaces\/todos\/[^/]+\/generate-spec$/.test(url.pathname),
      async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue()
          return
        }
        generateBody = route.request().postDataJSON() as typeof generateBody
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ job_id: 'job-task-a' }),
        })
      }
    )

    await page.getByTestId('nav-spec').click()
    await page.getByTestId('spec-agent-input').fill('Add REQ-099 for export API')
    await expect(page.getByTestId('spec-job-prompt-preview')).toContainText('REQ-099')
    await page.getByTestId('spec-agent-generate').click()
    await expect.poll(() => generateBody.prompt).toBe('Add REQ-099 for export API')
  })

  test('Trace gaps show refine hint and Refine to fix', async ({ page }) => {
    let generateBody: { prompt?: string; mode?: string } = {}
    await page.route((url) => url.pathname.includes('/trace-spec'), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error_count: 1,
          warning_count: 0,
          req_ids: ['REQ-002'],
          links: [{ req_id: 'REQ-002', in_design: false, task_steps: [] }],
          steps: [],
          design_headings: [],
          issues: [
            {
              code: 'TRACE_REQ_UNCOVERED',
              message: 'REQ-002 is not referenced in design.md or tasks.md.',
              severity: 'error',
              req_id: 'REQ-002',
            },
          ],
        }),
      })
    })
    await page.route(
      (url) => /\/workspaces\/todos\/[^/]+\/generate-spec$/.test(url.pathname),
      async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue()
          return
        }
        generateBody = route.request().postDataJSON() as typeof generateBody
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ job_id: 'job-task-a' }),
        })
      }
    )

    await page.getByTestId('nav-spec').click()
    await page.getByTestId('spec-agent-trace').click()
    await expect(page.getByTestId('spec-agent-trace-hint')).toBeVisible()
    await expect(page.getByTestId('spec-agent-trace-hint')).toContainText('trace error')

    await page.getByTestId('spec-agent-refine-hint').click()
    await expect.poll(() => generateBody.mode).toBe('refine')
    expect(generateBody.prompt).toContain('REQ-002')
  })
})
