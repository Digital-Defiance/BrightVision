import { expect, test } from '@playwright/test'
import {
  ensureTasksSeededWorkspace,
  TASKS_SEEDED_WORKSPACE,
} from '../helpers/fixtureWorkspaces'
import { isIntegrationE2eEnabled } from '../helpers/integrationEnv'

test.describe('Integration: tasks-seeded workspace', () => {
  test.skip(!isIntegrationE2eEnabled(), 'Run: yarn test:e2e:integration')

  test('GET /workspaces/todos returns seeded store from disk', async () => {
    ensureTasksSeededWorkspace()
    const qs = new URLSearchParams({ workspace: TASKS_SEEDED_WORKSPACE })
    const res = await fetch(`http://127.0.0.1:8741/workspaces/todos?${qs}`)
    expect(res.ok).toBeTruthy()
    const body = (await res.json()) as { todos?: { title?: string }[] }
    expect(body.todos?.some((t) => t.title === 'First task')).toBe(true)
  })
})
