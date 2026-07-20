import { expect, test } from '@playwright/test'
import { SPEC_PROGRESS_STEP1, SPEC_PROGRESS_STEP2 } from './helpers/specProgressFixture'
import { openTasks, startMockSession } from './helpers/session'

/**
 * Mocked core + real Python import_agent_plan on disk — spec tasks_md preserved,
 * agent step-1 done merged into checklist + tasks_md.
 */
test.describe('Spec implementation progress (mocked core)', () => {
  test('import-agent-plan merges agent done into preserved tasks_md', async ({ page }) => {
    await startMockSession(page, { scenario: 'spec-progress-merge' })

    await openTasks(page)

    const taskRow = page.getByTestId('todo-panel').getByRole('button', {
      name: /Spec progress feature/,
    })
    await expect(taskRow).toBeVisible({ timeout: 15_000 })
    await taskRow.click()

    await page.getByRole('tab', { name: 'Checklist' }).click()
    const first = page.getByRole('textbox', { name: 'Acceptance item…' }).first()
    const second = page.getByRole('textbox', { name: 'Acceptance item…' }).nth(1)
    await expect(first).toHaveValue(new RegExp(SPEC_PROGRESS_STEP1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    await expect(second).toHaveValue(new RegExp(SPEC_PROGRESS_STEP2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

    await page.getByTestId('todo-panel').getByRole('tab', { name: 'Tasks' }).click()
    const tasksMd = page.getByLabel('Implementation tasks')
    await expect(tasksMd).toContainText('- [x] 1. Wire generate-spec')
    await expect(tasksMd).toContainText('REQ-001')
    await expect(tasksMd).toContainText('- [ ] 2. Add tests')
  })
})
