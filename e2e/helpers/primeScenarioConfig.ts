import type { Page } from '@playwright/test'
import { E2E_CONFIG, E2E_CONFIG_STORAGE_KEY } from './testConfig'
import { getScenario, type ScenarioName } from './scenarios'
import {
  ensureAgentTodoCharSplitWorkspace,
  ensureEditBlockWorkspace,
  ensureTasksSeededWorkspace,
} from './fixtureWorkspaces'
import { normalizeWorkspacePath } from './workspacePath'

export async function primeScenarioConfig(page: Page, scenario: ScenarioName) {
  const def = getScenario(scenario)
  let workingDir = E2E_CONFIG.workingDir
  if (def.workspace === 'edit-block') workingDir = ensureEditBlockWorkspace()
  if (def.workspace === 'tasks-seeded') workingDir = ensureTasksSeededWorkspace()
  if (def.workspace === 'agent-todo-char-split') workingDir = ensureAgentTodoCharSplitWorkspace()
  if (def.workspace) workingDir = normalizeWorkspacePath(workingDir)
  const cfg = {
    ...E2E_CONFIG,
    workingDir,
    autoLoadSession: def.config?.autoLoadSession ?? false,
    autoSaveSession: def.config?.autoSaveSession ?? false,
  }
  await page.addInitScript(
    ([key, config]) => {
      localStorage.setItem('vision-welcome-dismissed', '1')
      localStorage.setItem(key, JSON.stringify(config))
    },
    [E2E_CONFIG_STORAGE_KEY, cfg] as const
  )
}
