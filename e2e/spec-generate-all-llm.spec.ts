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
  runAllLayersGenerateSpecDialog,
} from './helpers/specGenerate'

const hooks = specGenerateLlmHooks()

test.describe.configure({
  mode: 'serial',
  timeout: SPEC_GEN_MS + 600_000,
})

test.describe('Spec generate LLM all layers (real Ollama + Vision API) @spec-gen', () => {
  test.beforeAll(hooks.beforeAll)
  test.afterEach(hooks.afterEach)

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
