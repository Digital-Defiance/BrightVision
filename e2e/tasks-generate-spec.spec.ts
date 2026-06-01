import { expect, test } from '@playwright/test'
import { sampleTodoStore } from './helpers/fixtures'
import { openTasks, startMockSession } from './helpers/session'
import { assessGeneratedSpecLayers } from '../src/utils/specLayers'

test.describe('Tasks generate/refine spec layers (roadmap #18)', () => {
  test.beforeEach(async ({ page }) => {
    await startMockSession(page, { initialTodos: sampleTodoStore() })
    await openTasks(page)
    await expect(page.getByTestId('todo-new')).toBeEnabled({ timeout: 15_000 })
    await expect(page.getByText('First task')).toBeVisible({ timeout: 10_000 })
  })

  test('generate spec closes dialog and shows activity bar while job runs', async ({ page }) => {
    let polls = 0
    await page.route(
      (url) => /\/workspaces\/todos\/generate-spec\//.test(url.pathname),
      async (route) => {
        polls += 1
        if (polls < 3) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'pending', job_id: 'job-task-a' }),
          })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'completed',
            requirements: '### REQ-001\n**WHEN** x\n**THE** system **SHALL** y.\n',
            design: '## Design',
            tasks_md: '- [ ] 1. Step (depends: none)',
            raw: '',
            item: null,
          }),
        })
      }
    )

    await page.getByText('First task').click()
    await page.getByTestId('todo-generate-spec-wizard').click()
    await page.getByRole('dialog').getByRole('textbox').fill('E2E non-blocking generate')
    await page.getByRole('button', { name: 'Run' }).click()

    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByTestId('vision-activity')).toBeVisible()
    await expect(page.getByTestId('vision-activity')).toContainText('GENERATING REQUIREMENTS')
    await page.getByTestId('nav-chat').click()
    await expect(page.getByTestId('chat-input')).toBeVisible()
    await expect(page.getByTestId('spec-generating-chip')).toBeVisible()
  })

  test('generate spec fills requirements, design, and tasks tabs', async ({ page }) => {
    await page.getByText('First task').click()
    await page.getByTestId('todo-generate-spec-wizard').click()
    await page.getByRole('dialog').getByRole('textbox').fill('E2E ping counter feature')
    await page.getByRole('button', { name: 'Run' }).click()

    const requirementsField = page.getByLabel('Requirements (EARS-style)')
    await expect(requirementsField).toHaveValue(/REQ-001/, { timeout: 15_000 })

    const requirements = await requirementsField.inputValue()
    await page.getByRole('tab', { name: 'Design' }).click()
    const design = await page.getByLabel('Design').inputValue()
    await page.getByRole('tab', { name: 'Tasks' }).click()
    const tasksMd = await page.getByLabel('Implementation tasks').inputValue()

    const assessment = assessGeneratedSpecLayers({
      requirements,
      design,
      tasks_md: tasksMd,
    })
    expect(assessment.ok, assessment.issues.join('; ')).toBe(true)

    // Kiro-grade structure flows through to the UI.
    expect(requirements).toMatch(/User Story/i)
    expect(requirements).toMatch(/Acceptance Criteria/i)
    expect(design).toMatch(/Architecture/i)
    expect(design).toMatch(/Testing Strategy/i)
  })

  test('refine spec keeps sane layers', async ({ page }) => {
    await page.getByText('First task').click()
    await page.getByRole('button', { name: 'Refine spec' }).click()
    await page.getByRole('dialog').getByRole('textbox').fill('Align tasks with REQ-002')
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(page.getByLabel('Requirements (EARS-style)')).toHaveValue(/REQ-002/, {
      timeout: 15_000,
    })
    await page.getByTestId('todo-validate-ears').click()
    await expect(page.getByTestId('ears-lint-summary')).toContainText('EARS OK', {
      timeout: 10_000,
    })
  })

  test('ears_blocked shows warning snackbar', async ({ page }) => {
    await page.route(
      (url) => /\/workspaces\/todos\/generate-spec\//.test(url.pathname),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'completed',
            requirements: '### REQ-001\n**WHEN** x\n**THE** system shows y.\n',
            design: '## Design',
            tasks_md: '- [ ] 1. Step (depends: none)',
            raw: '',
            ears_blocked: true,
            ears_issues: [{ code: 'EARS_NO_SHALL', message: 'missing SHALL', severity: 'error' }],
            item: null,
          }),
        })
      }
    )
    await page.route(
      (url) => /\/workspaces\/todos\/[^/]+\/generate-spec$/.test(url.pathname),
      async (route) => {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ job_id: 'job-ears-blocked', status: 'pending', todo_id: 'task-a' }),
        })
      }
    )

    await page.getByText('First task').click()
    await page.getByTestId('todo-generate-spec-wizard').click()
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(page.getByText(/not saved|EARS error/i)).toBeVisible({ timeout: 15_000 })
  })
})
