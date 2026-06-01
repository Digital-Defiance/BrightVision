import { expect, test } from '@playwright/test'
import { assessGeneratedSpecLayers } from '../src/utils/specLayers'
import { primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'
import { openTasks } from './helpers/session'
import {
  createEmptySpecTask,
  LAYER_WAIT_MS,
  SPEC_GEN_MS,
  specGenerateLlmHooks,
} from './helpers/specGenerateLlmShared'
import {
  expectDesignPopulated,
  expectRequirementsPopulated,
  expectTasksPopulated,
  runWizardGenerateSpecDialog,
} from './helpers/specGenerate'

const hooks = specGenerateLlmHooks()

test.describe.configure({
  mode: 'serial',
  timeout: SPEC_GEN_MS * 4 + 900_000,
})

test.describe('Spec generate LLM phased wizard (real Ollama + Vision API) @spec-gen', () => {
  test.beforeAll(hooks.beforeAll)
  test.afterEach(hooks.afterEach)

  test('phased wizard: requirements → design → tasks', async ({ page }) => {
    await primeLlmE2eApp(page)
    await startLlmE2eSession(page, 180_000)
    await openTasks(page)
    await createEmptySpecTask(page)

    await runWizardGenerateSpecDialog(page, {
      prompt:
        'Feature: minimal health ping endpoint. Exactly REQ-001 and REQ-002 with WHEN and SHALL. Keep each requirement to one sentence.',
      timeoutMs: SPEC_GEN_MS,
    })
    const requirements = await expectRequirementsPopulated(page, LAYER_WAIT_MS)

    await page.getByRole('tab', { name: 'Design' }).click()
    await expect(page.getByTestId('todo-generate-spec-wizard')).toHaveText('Generate design')
    await runWizardGenerateSpecDialog(page, {
      prompt: 'Brief architecture citing REQ-001 and REQ-002.',
      timeoutMs: SPEC_GEN_MS,
    })
    const design = await expectDesignPopulated(page, LAYER_WAIT_MS)

    await page.getByRole('tab', { name: 'Tasks' }).click()
    await expect(page.getByTestId('todo-generate-spec-wizard')).toHaveText('Generate tasks')
    await runWizardGenerateSpecDialog(page, {
      prompt: 'Two numbered implementation tasks with dependencies.',
      timeoutMs: SPEC_GEN_MS,
    })
    const tasksMd = await expectTasksPopulated(page, LAYER_WAIT_MS)

    const assessment = assessGeneratedSpecLayers({
      requirements,
      design,
      tasks_md: tasksMd,
    })
    expect(assessment.ok, assessment.issues.join('; ')).toBe(true)

    await page.getByRole('tab', { name: /^Requirements/ }).click()
    const lintDone = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        res.url().includes('/lint-requirements') &&
        res.ok(),
      { timeout: 60_000 }
    )
    await page.getByTestId('todo-validate-ears').click()
    await lintDone
    const summary = page.getByTestId('ears-lint-summary')
    await expect(summary).toBeVisible({ timeout: 30_000 })
    const summaryText = await summary.innerText()
    if (!/EARS OK/i.test(summaryText)) {
      test.info().annotations.push({
        type: 'note',
        description: `EARS lint after phased wizard: ${summaryText}`,
      })
    }
  })
})
