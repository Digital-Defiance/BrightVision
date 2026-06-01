import { expect, test } from '@playwright/test'
import { sampleTodoStore } from './helpers/fixtures'
import { openTasks, startMockSession } from './helpers/session'

test.describe('Tasks EARS validate (roadmap #21)', () => {
  test.beforeEach(async ({ page }) => {
    await startMockSession(page, { initialTodos: sampleTodoStore() })
    await openTasks(page)
    await expect(page.getByTestId('todo-new')).toBeEnabled({ timeout: 15_000 })
    await expect(page.getByText('First task')).toBeVisible({ timeout: 10_000 })
  })

  test('Validate EARS shows lint issues from API', async ({ page }) => {
    await page.route(
      (url) => url.pathname.includes('/lint-requirements'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error_count: 1,
            warning_count: 0,
            issues: [
              {
                code: 'EARS_NO_SHALL',
                message: 'Requirement clause should include SHALL',
                severity: 'error',
                line: 2,
                req_id: 'REQ-001',
              },
            ],
            clauses: [],
          }),
        })
      }
    )

    await page.getByText('First task').click()
    await page.getByTestId('todo-validate-ears').click()

    await expect(page.getByTestId('ears-lint-summary')).toContainText('1 error')
    await expect(page.getByTestId('ears-lint-issues')).toContainText('EARS_NO_SHALL')
  })
})
