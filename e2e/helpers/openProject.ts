/**
 * E2E priming for IDE-style open project (must match src/ipc/openProject.ts keys).
 */

import type { Page } from '@playwright/test'

export const E2E_WELCOME_DISMISSED_KEY = 'vision-welcome-dismissed'
export const E2E_PROJECT_GATE_SKIP_KEY = 'vision-skip-project-gate'
export const E2E_CURRENT_PROJECT_KEY = 'vision-current-project'

/** Serializable tuple for page.addInitScript — sets welcome dismissed + skip gate + current project. */
export function openProjectStorageArgs(workingDir: string) {
  return [
    E2E_WELCOME_DISMISSED_KEY,
    E2E_PROJECT_GATE_SKIP_KEY,
    E2E_CURRENT_PROJECT_KEY,
    workingDir || '.',
  ] as const
}

export function applyOpenProjectStorage(
  args: readonly [welcomeKey: string, skipKey: string, currentKey: string, workingDir: string]
) {
  const [welcomeKey, skipKey, currentKey, workingDir] = args
  localStorage.setItem(welcomeKey, '1')
  localStorage.setItem(skipKey, '1')
  localStorage.setItem(currentKey, workingDir || '.')
}

/** Skip launch gate and pin the workspace path (call before navigation). */
export async function primeOpenProject(page: Page, workingDir: string) {
  await page.addInitScript(applyOpenProjectStorage, openProjectStorageArgs(workingDir))
}
