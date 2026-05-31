import { expect, test } from '@playwright/test'
import { assessGeneratedSpecLayers } from '../src/utils/specLayers'
import {
  assertOllamaForLlmE2e,
  ensureLlmE2eWorkspace,
  isLlmE2eEnabled,
} from './helpers/llmEnv'
import { primeLlmE2eApp, startLlmE2eSession } from './helpers/llmSession'
import { openTasks, selectTodoTemplate } from './helpers/session'
import {
  expectDesignPopulated,
  expectRequirementsPopulated,
  expectTasksPopulated,
  runAllLayersGenerateSpecDialog,
  runWizardGenerateSpecDialog,
  specGenTimeoutMs,
} from './helpers/specGenerate'

const SPEC_GEN_MS = specGenTimeoutMs()
const LAYER_WAIT_MS = Math.min(180_000, SPEC_GEN_MS)

// Phased flow runs up to 3 sequential jobs; legacy all-layers adds a 4th.
test.describe.configure({ mode: 'serial', timeout: SPEC_GEN_MS * 4 + 900_000 })

async function createEmptySpecTask(page: import('@playwright/test').Page) {
  await selectTodoTemplate(page, 'spec-driven')
  await page.getByTestId('todo-new').click()
  const newRow = page.getByText(/Task \d+/).first()
  await expect(newRow).toBeVisible({ timeout: 10_000 })
  await newRow.click()
  await expect(page.getByTestId('todo-generate-spec-wizard')).toBeEnabled({ timeout: 15_000 })
  await expect(page.getByTestId('todo-generate-spec-wizard')).toHaveText('Generate requirements')
}

test.describe('Spec generate LLM (real Ollama + Vision API) @spec-gen', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm (E2E_LLM=1)')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
    ensureLlmE2eWorkspace()
  })

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

  test('all layers (legacy one-shot) produces EARS-shaped three layers', async ({ page }) => {
    await primeLlmE2eApp(page)
    await startLlmE2eSession(page, 180_000)
    await openTasks(page)
    await createEmptySpecTask(page)

    await runAllLayersGenerateSpecDialog(
      page,
      'Feature: minimal health ping endpoint. REQ-001 and REQ-002 with WHEN and SHALL. Design must cite REQ-001 and REQ-002 by id. Two numbered implementation tasks.',
      SPEC_GEN_MS
    )
    const requirements = await expectRequirementsPopulated(page, LAYER_WAIT_MS)

    await page.getByRole('tab', { name: 'Design' }).click()
    const design = await expectDesignPopulated(page, LAYER_WAIT_MS)
    await page.getByRole('tab', { name: 'Tasks' }).click()
    const tasksMd = await expectTasksPopulated(page, LAYER_WAIT_MS)

    const assessment = assessGeneratedSpecLayers({
      requirements,
      design,
      tasks_md: tasksMd,
    })
    expect(assessment.ok, assessment.issues.join('; ')).toBe(true)
  })
})
