import { expect, test } from '@playwright/test'
import { sampleTodoStore } from './helpers/fixtures'
import { openTasks, startMockSession } from './helpers/session'

test.describe('Tasks spec index & trace (roadmap #22)', () => {
  test.beforeEach(async ({ page }) => {
    await startMockSession(page, { initialTodos: sampleTodoStore() })
    await openTasks(page)
    await expect(page.getByTestId('todo-new')).toBeEnabled({ timeout: 15_000 })
    await expect(page.getByText('First task')).toBeVisible({ timeout: 10_000 })
  })

  test('Check spec index shows workspace scan summary', async ({ page }) => {
    await page.route(
      (url) => url.pathname.endsWith('/spec-index'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error_count: 1,
            warning_count: 1,
            task_ids: ['t1'],
            folders: [],
            issues: [
              {
                code: 'SPEC_REQ_ID_GLOBAL_DUP',
                message: 'REQ-001 appears in multiple tasks',
                severity: 'error',
                req_id: 'REQ-001',
              },
            ],
          }),
        })
      }
    )

    await page.getByTestId('todo-spec-index').click()
    await expect(page.getByTestId('spec-index-summary')).toContainText('1 error')
    await expect(page.getByTestId('spec-index-issues')).toContainText('SPEC_REQ_ID_GLOBAL_DUP')
  })

  test('Remove orphans calls prune API and refreshes spec index', async ({ page }) => {
    let pruneCalled = false
    await page.route(
      (url) => url.pathname.endsWith('/prune-orphan-spec-folders'),
      async (route) => {
        pruneCalled = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ removed_count: 2, removed_ids: ['orphan-a', 'orphan-b'] }),
        })
      }
    )
    await page.route(
      (url) => url.pathname.endsWith('/spec-index'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            error_count: 0,
            warning_count: 0,
            task_ids: ['task-a'],
            folders: [{ todo_id: 'task-a', has_requirements: true }],
            issues: [],
          }),
        })
      }
    )

    await page.getByTestId('todo-prune-orphan-spec-folders').click()
    await expect.poll(() => pruneCalled).toBe(true)
    await expect(page.getByText(/Removed 2 orphan/i)).toBeVisible()
    await expect(page.getByTestId('spec-index-summary')).toContainText('Spec index OK')
  })

  test('Trace coverage shows gaps for active task', async ({ page }) => {
    await page.route(
      (url) => url.pathname.includes('/trace-spec'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            error_count: 0,
            warning_count: 1,
            req_ids: ['REQ-001', 'REQ-002'],
            links: [],
            steps: [],
            design_headings: [],
            issues: [
              {
                code: 'TRACE_REQ_UNCOVERED',
                message: 'REQ-002 is not referenced in design.md or tasks.md.',
                severity: 'warning',
                req_id: 'REQ-002',
              },
            ],
          }),
        })
      }
    )

    await page.getByText('First task').click()
    await page.getByRole('tab', { name: 'Tasks' }).click()
    await page.getByTestId('todo-trace-spec').click()
    await expect(page.getByTestId('spec-trace-summary')).toContainText('2 requirement')
    await expect(page.getByTestId('spec-trace-issues')).toContainText('TRACE_REQ_UNCOVERED')
  })
})
