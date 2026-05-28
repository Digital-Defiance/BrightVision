import { expect, test } from '@playwright/test'
import { proposedEditTurnEvents } from './helpers/fixtures'
import { openChat, startMockSession } from './helpers/session'

test.describe('Proposed edits apply (roadmap #2)', () => {
  test('Apply to workspace writes SEARCH/REPLACE via Tauri', async ({ page }) => {
    const writes: { path?: string; content?: string }[] = []

    await startMockSession(page, {
      messageTurns: [proposedEditTurnEvents()],
      tauri: {
        handlers: {
          read_workspace_text_file: async (args) => {
            const path = String((args as { path?: string }).path ?? '')
            if (path === 'src/example.ts') return 'old\n'
            return ''
          },
          write_workspace_text_file: async (args) => {
            writes.push(args as { path?: string; content?: string })
          },
        },
      },
    })
    await openChat(page)

    await page.getByTestId('chat-input').fill('Patch src/example.ts')
    await page.getByTestId('chat-send').click()

    await expect(page.getByText('Proposed only')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /src\/example\.ts/ }).click()
    await page.getByTestId('proposed-edit-apply').click()

    await expect.poll(() => writes.length).toBeGreaterThan(0)
    const last = writes[writes.length - 1]
    expect(String(last.path ?? '')).toContain('example.ts')
    expect(String(last.content ?? '')).toContain('new')
    expect(String(last.content ?? '')).not.toContain('old')
  })

  test('Apply uses fuzzy match when SEARCH omits workspace indent', async ({ page }) => {
    const writes: { path?: string; content?: string }[] = []

    await startMockSession(page, {
      messageTurns: [
        [
          {
            type: 'token',
            text:
              '► **ANSWER**\n\n```src/indented.ts\n<<<<<<< SEARCH\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> REPLACE\n```\n',
          },
          { type: 'done', edited_files: [] as string[] },
        ],
      ],
      tauri: {
        handlers: {
          read_workspace_text_file: async (args) => {
            const path = String((args as { path?: string }).path ?? '')
            if (path === 'src/indented.ts') return '  const x = 1;\n'
            return ''
          },
          write_workspace_text_file: async (args) => {
            writes.push(args as { path?: string; content?: string })
          },
        },
      },
    })
    await openChat(page)

    await page.getByTestId('chat-input').fill('Patch src/indented.ts')
    await page.getByTestId('chat-send').click()
    await expect(page.getByText('Proposed only')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /src\/indented\.ts/ }).click()
    await page.getByTestId('proposed-edit-apply').click()

    await expect.poll(() => writes.length).toBeGreaterThan(0)
    expect(String(writes[writes.length - 1].content ?? '')).toContain('const x = 2')
    expect(String(writes[writes.length - 1].content ?? '')).toMatch(/^\s{2}const x = 2/m)
  })
})
