import { expect, test } from '@playwright/test'
import { expectOptimisticSend } from './helpers/chatSend'
import { E2E_EDIT_BLOCK_NEW, E2E_EDIT_BLOCK_REL } from './helpers/fixtureWorkspaces'
import { listScenarioNames } from './helpers/scenarios'
import { openChat, openTasks, startMockSession } from './helpers/session'

/**
 * Scenario-driven coverage: every registered SSE scenario must produce its expected UI signal.
 * See e2e/fixtures/README.md and e2e/ROADMAP_COVERAGE.md.
 */
for (const name of listScenarioNames()) {
  test.describe(`Scenario: ${name}`, () => {
    test('produces expected output', async ({ page }) => {
      const writes: { path?: string; content?: string }[] = []
      await startMockSession(
        page,
        name === 'proposed-edit'
          ? {
              scenario: name,
              tauri: {
                handlers: {
                  write_workspace_text_file: async (args) => {
                    writes.push(args as { path?: string; content?: string })
                  },
                },
              },
            }
          : { scenario: name }
      )
      await openChat(page)

      if (name === 'session-transcript') {
        await expect(page.getByText('prior assistant reply from saved session')).toBeVisible({
          timeout: 5_000,
        })
        return
      }

      await page.getByTestId('chat-input').fill(`e2e scenario ${name}`)
      await page.getByTestId('chat-send').click()
      await expectOptimisticSend(page, `e2e scenario ${name}`)

      switch (name) {
        case 'default':
          await expect(page.getByText('Answer', { exact: true })).toBeVisible({ timeout: 15_000 })
          await expect(page.getByTestId('token-stats')).toContainText('120 sent')
          break
        case 'proposed-edit':
          await expect(page.getByText('Proposed only')).toBeVisible({ timeout: 15_000 })
          await page.getByRole('button', { name: new RegExp(E2E_EDIT_BLOCK_REL) }).click()
          await page.getByTestId('proposed-edit-apply').click()
          await expect.poll(() => writes.length).toBeGreaterThan(0)
          expect(String(writes.at(-1)?.content ?? '')).toContain(E2E_EDIT_BLOCK_NEW.trim())
          break
        case 'applied-edit':
          await expect(page.getByText('Applied', { exact: true })).toBeVisible({ timeout: 15_000 })
          break
        case 'display-fence':
          await expect(page.getByTestId('chat-fence-block')).toBeVisible({ timeout: 15_000 })
          await expect(page.getByTestId('chat-fence-block')).toContainText(
            'print("e2e-display-fence")'
          )
          await expect(page.getByText('Proposed only')).toHaveCount(0)
          break
        case 'confirm':
          await expect(page.getByRole('button', { name: 'Yes' })).toBeVisible({ timeout: 15_000 })
          break
        case 'suggested-files':
          await expect(page.getByTestId('suggested-files-tray')).toBeVisible({ timeout: 15_000 })
          await expect(page.getByTestId('suggested-files-tray')).toContainText('src/suggested-a.ts')
          break
        case 'cumulative-stream':
          await expect(page.getByText('Workspace roadmap.', { exact: true })).toBeVisible({
            timeout: 15_000,
          })
          await expect(page.getByText('Workspace Workspace')).toHaveCount(0)
          break
        case 'scan-progress':
          await expect(page.getByText('Done scanning.')).toBeVisible({ timeout: 15_000 })
          break
        case 'empty-llm':
          await expect(page.getByTestId('empty-llm-warning')).toBeVisible({ timeout: 15_000 })
          await expect(page.getByTestId('empty-llm-retry-exact')).toBeVisible()
          break
        case 'tasks-seeded':
          await openTasks(page)
          await expect(page.getByText('First task')).toBeVisible({ timeout: 15_000 })
          break
        case 'markdown-answer':
          await expect(
            page.getByTestId('chat-markdown').filter({ hasText: 'Open Items' })
          ).toBeVisible({ timeout: 15_000 })
          await expect(page.getByRole('listitem').filter({ hasText: '#21' })).toBeVisible()
          break
        default:
          break
      }
    })
  })
}
