import { expect, test } from '@playwright/test'
import { wizardEmptyTodoStore } from './helpers/fixtures'
import { openTasks, startMockSession } from './helpers/session'

const REQ_DRAFT = '### REQ-001\n**WHEN** the user opens Tasks\n**THE** system **SHALL** list todos.\n'
const DESIGN_DRAFT = '## Overview\nCovers REQ-001.\n'

async function selectWizardTask(page: import('@playwright/test').Page) {
  await openTasks(page)
  await expect(page.getByTestId('todo-new')).toBeEnabled({ timeout: 15_000 })
  await page.getByText('Wizard task').click()
}

test.describe('Spec wizard phased flow (roadmap #23)', () => {
  test.beforeEach(async ({ page }) => {
    await startMockSession(page, { initialTodos: wizardEmptyTodoStore() })
    await selectWizardTask(page)
  })

  test('empty task shows requirements nudge and Generate requirements button', async ({ page }) => {
    await expect(page.getByTestId('spec-wizard-nudge-req-missing')).toBeVisible()
    await expect(page.getByTestId('spec-wizard-nudge-req-missing')).toContainText(/Step 1/)
    await expect(page.getByTestId('todo-generate-spec-wizard')).toHaveText('Generate requirements')
  })

  test('blocks Design tab until requirements exist', async ({ page }) => {
    await page.getByRole('tab', { name: 'Design' }).click()
    await expect(page.getByTestId('spec-tab-gate-alert')).toContainText(/requirements/i)
    await expect(page.getByLabel('Requirements (EARS-style)')).toBeVisible()
    await expect(page.getByLabel('Design')).toHaveCount(0)
  })

  test('blocks Tasks tab until design exists', async ({ page }) => {
    await page.getByLabel('Requirements (EARS-style)').fill(REQ_DRAFT)
    await page.getByLabel('Requirements (EARS-style)').blur()
    await page.getByRole('tab', { name: 'Tasks' }).click()
    await expect(page.getByTestId('spec-tab-gate-alert')).toContainText(/design/i)
    await expect(page.getByLabel('Implementation tasks')).toHaveCount(0)
  })

  test('requirements nudge opens generate dialog for requirements layer', async ({ page }) => {
    await page
      .getByTestId('spec-wizard-nudge-req-missing')
      .getByRole('button', { name: 'Generate requirements' })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Generate requirements')
    await expect(dialog.getByRole('textbox')).toHaveValue(/Feature: Wizard task/)
  })

  test('shows design-next nudge after requirements draft', async ({ page }) => {
    await page.getByLabel('Requirements (EARS-style)').fill(REQ_DRAFT)
    await page.getByLabel('Requirements (EARS-style)').blur()
    await expect(page.getByTestId('spec-wizard-nudge-design-next')).toBeVisible()
    await expect(page.getByTestId('spec-wizard-nudge-design-next')).toContainText(/Requirements ready/)
  })

  test('wizard button label follows active spec tab', async ({ page }) => {
    await expect(page.getByTestId('todo-generate-spec-wizard')).toHaveText('Generate requirements')

    await page.getByLabel('Requirements (EARS-style)').fill(REQ_DRAFT)
    await page.getByLabel('Requirements (EARS-style)').blur()
    await page.getByRole('tab', { name: 'Design' }).click()
    await expect(page.getByTestId('todo-generate-spec-wizard')).toHaveText('Generate design')

    await page.getByLabel('Design').fill(DESIGN_DRAFT)
    await page.getByLabel('Design').blur()
    await page.getByRole('tab', { name: 'Tasks' }).click()
    await expect(page.getByTestId('todo-generate-spec-wizard')).toHaveText('Generate tasks')
  })

  test('POST section=requirements from requirements tab', async ({ page }) => {
    let postedSection: string | undefined
    await page.route(
      (url) => /\/workspaces\/todos\/[^/]+\/generate-spec$/.test(url.pathname),
      async (route) => {
        const body = route.request().postDataJSON() as { section?: string }
        postedSection = body.section
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ job_id: 'job-wizard-req', status: 'pending', todo_id: 'task-wizard' }),
        })
      }
    )
    await page.route(
      (url) => /\/workspaces\/todos\/generate-spec\/job-wizard-req$/.test(url.pathname),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'completed',
            requirements: REQ_DRAFT,
            design: '',
            tasks_md: '',
            raw: '',
            item: null,
          }),
        })
      }
    )

    await page.getByTestId('todo-generate-spec-wizard').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Run' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    expect(postedSection).toBe('requirements')
  })

  test('POST section=design from design tab shows GENERATING DESIGN', async ({ page }) => {
    let postedSection: string | undefined
    let polls = 0
    await page.getByLabel('Requirements (EARS-style)').fill(REQ_DRAFT)
    await page.getByLabel('Requirements (EARS-style)').blur()
    await page.getByRole('tab', { name: 'Design' }).click()

    await page.route(
      (url) => /\/workspaces\/todos\/[^/]+\/generate-spec$/.test(url.pathname),
      async (route) => {
        const body = route.request().postDataJSON() as { section?: string }
        postedSection = body.section
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ job_id: 'job-wizard-design', status: 'pending', todo_id: 'task-wizard' }),
        })
      }
    )
    await page.route(
      (url) => /\/workspaces\/todos\/generate-spec\/job-wizard-design$/.test(url.pathname),
      async (route) => {
        polls += 1
        if (polls < 2) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'pending', job_id: 'job-wizard-design' }),
          })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'completed',
            requirements: REQ_DRAFT,
            design: DESIGN_DRAFT,
            tasks_md: '',
            raw: '',
            item: null,
          }),
        })
      }
    )

    await page.getByTestId('todo-generate-spec-wizard').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Run' }).click()
    await expect(page.getByTestId('vision-activity')).toContainText('GENERATING DESIGN')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    expect(postedSection).toBe('design')
  })

  test('All layers opens legacy dialog and POST section=all', async ({ page }) => {
    let postedSection: string | undefined
    await page.route(
      (url) => /\/workspaces\/todos\/[^/]+\/generate-spec$/.test(url.pathname),
      async (route) => {
        const body = route.request().postDataJSON() as { section?: string }
        postedSection = body.section
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ job_id: 'job-wizard-all', status: 'pending', todo_id: 'task-wizard' }),
        })
      }
    )
    await page.route(
      (url) => /\/workspaces\/todos\/generate-spec\/job-wizard-all$/.test(url.pathname),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'completed',
            requirements: REQ_DRAFT,
            design: DESIGN_DRAFT,
            tasks_md: '- [ ] 1. Step (depends: none)',
            raw: '',
            item: null,
          }),
        })
      }
    )

    await page.getByTestId('todo-generate-spec-all').click()
    await expect(page.getByRole('dialog')).toContainText('Generate all spec layers')
    await page.getByRole('dialog').getByRole('button', { name: 'Run' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    expect(postedSection).toBe('all')
  })
})
