import { expect, test } from '@playwright/test'
import { agentPlanTitleLooksValid } from './helpers/agentTodoFixture'
import { openTasks, startMockSession } from './helpers/session'

/**
 * Char-split agent todo.txt on disk → mock core preloads import at session mock install.
 */
test.describe('Agent todo char-split → Tasks title', () => {
  test('import from disk shows recovered task title, not [', async ({ page }) => {
    await startMockSession(page, { scenario: 'agent-todo-char-split' })
    await openTasks(page)

    const taskButton = page.getByTestId('todo-panel').getByRole('button', {
      name: /Explore the codebase/,
    })
    await expect(taskButton).toBeVisible({ timeout: 15_000 })
    await taskButton.click()

    const titleField = page.getByLabel('Title')
    await expect(titleField).toHaveValue(/Explore the codebase/)
    expect(agentPlanTitleLooksValid(await titleField.inputValue())).toBe(true)

    await expect(page.getByTestId('todo-panel').getByRole('button', { name: '^\[$' })).toHaveCount(0)
  })
})
