import { expect, type Page, type Response } from '@playwright/test'

/** Align with `LLM_SPEC_GEN_TIMEOUT_S` / pytest `spec_gen_timeout_s()`. */
export function specGenTimeoutMs(): number {
  const raw = process.env.LLM_SPEC_GEN_TIMEOUT_S ?? '600'
  const sec = Number(raw)
  return (Number.isFinite(sec) && sec > 0 ? sec : 600) * 1000
}

function isGenerateSpecJobPoll(res: Response): boolean {
  return (
    res.request().method() === 'GET' &&
    res.url().includes('/workspaces/todos/generate-spec/') &&
    res.ok()
  )
}

function coreApiBase(page: Page): string {
  const origin = new URL(page.url()).origin
  return `${origin}/api/core`
}

/** Active poll — does not rely on the UI client’s poll loop staying alive. */
export async function waitForWorkspaceSpecGenerateJob(
  page: Page,
  jobId: string,
  timeoutMs = specGenTimeoutMs()
): Promise<{ status: string; error?: string | null }> {
  const url = `${coreApiBase(page)}/workspaces/todos/generate-spec/${encodeURIComponent(jobId)}`
  const deadline = Date.now() + timeoutMs
  let lastStatus = 'unknown'
  while (Date.now() < deadline) {
    const res = await page.request.get(url, { timeout: 30_000 })
    if (!res.ok()) {
      throw new Error(`spec job poll: HTTP ${res.status()} ${await res.text()}`)
    }
    const body = (await res.json()) as { status?: string; error?: string | null }
    lastStatus = body.status ?? lastStatus
    if (body.status === 'completed' || body.status === 'error') {
      return body
    }
    await page.waitForTimeout(1000)
  }
  throw new Error(
    `Spec generate job ${jobId.slice(0, 8)}… still ${lastStatus} after ${Math.round(timeoutMs / 1000)}s`
  )
}

/** Wait until any in-flight generate-spec poll reports completed or error. */
export async function waitForWorkspaceSpecGenerate(page: Page, timeoutMs = specGenTimeoutMs()) {
  const started = Date.now()
  const remaining = () => Math.max(1000, timeoutMs - (Date.now() - started))
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await page.waitForResponse(
        async (r) => {
          if (!isGenerateSpecJobPoll(r)) return false
          try {
            const body = (await r.json()) as { status?: string; error?: string | null }
            return body.status === 'completed' || body.status === 'error'
          } catch {
            return false
          }
        },
        { timeout: Math.min(15_000, remaining()) }
      )
      return res
    } catch {
      /* UI may have stopped polling; keep listening until deadline */
    }
  }
  throw new Error(`No completed generate-spec poll within ${Math.round(timeoutMs / 1000)}s`)
}

/** Click Run in generate dialog and wait for job completion + dialog close. */
export async function runGenerateSpecDialog(page: Page, timeoutMs = specGenTimeoutMs()) {
  const dialog = page.getByRole('dialog')
  const postDone = page.waitForResponse(
    (res) =>
      res.request().method() === 'POST' &&
      res.url().includes('/workspaces/todos/') &&
      res.url().includes('/generate-spec') &&
      (res.status() === 202 || res.ok()),
    { timeout: 60_000 }
  )
  await dialog.getByRole('button', { name: 'Run' }).click()
  const postRes = await postDone
  let jobId: string | undefined
  if (postRes.status() === 202) {
    const started = (await postRes.json()) as { job_id?: string }
    jobId = started.job_id
  }
  if (jobId) {
    const body = await waitForWorkspaceSpecGenerateJob(page, jobId, timeoutMs)
    if (body.status === 'error') {
      throw new Error(body.error || 'Spec generation failed')
    }
  } else {
    const res = await waitForWorkspaceSpecGenerate(page, timeoutMs)
    const body = (await res.json()) as { status?: string; error?: string | null }
    if (body.status === 'error') {
      throw new Error(body.error || 'Spec generation failed')
    }
  }
  await expect(dialog).toBeHidden({ timeout: 60_000 })
}

export async function expectRequirementsPopulated(
  page: Page,
  timeoutMs = 60_000
): Promise<string> {
  await expect
    .poll(
      async () => {
        const text = await page.getByLabel('Requirements (EARS-style)').inputValue()
        return /REQ-\d+/i.test(text) && /\bshall\b/i.test(text)
      },
      { timeout: timeoutMs }
    )
    .toBe(true)
  return page.getByLabel('Requirements (EARS-style)').inputValue()
}

export async function expectDesignPopulated(page: Page, timeoutMs = 60_000): Promise<string> {
  await expect
    .poll(
      async () => {
        const text = await page.getByLabel('Design').inputValue()
        return text.trim().length > 24
      },
      { timeout: timeoutMs }
    )
    .toBe(true)
  return page.getByLabel('Design').inputValue()
}

export async function expectTasksPopulated(page: Page, timeoutMs = 60_000): Promise<string> {
  await expect
    .poll(
      async () => {
        const text = await page.getByLabel('Implementation tasks').inputValue()
        return /^\s*[-*]\s*\[\s*[ xX]\s*\]\s*\d+\./m.test(text)
      },
      { timeout: timeoutMs }
    )
    .toBe(true)
  return page.getByLabel('Implementation tasks').inputValue()
}

/** Open wizard dialog on the active spec tab, optionally edit prompt, Run, wait for job. */
export async function runWizardGenerateSpecDialog(
  page: Page,
  opts?: { prompt?: string; timeoutMs?: number }
) {
  const timeoutMs = opts?.timeoutMs ?? specGenTimeoutMs()
  await page.getByTestId('todo-generate-spec-wizard').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  if (opts?.prompt !== undefined) {
    await dialog.getByRole('textbox').fill(opts.prompt)
  }
  await runGenerateSpecDialog(page, timeoutMs)
}

/** Legacy one-shot generate via **All layers** button. */
export async function runAllLayersGenerateSpecDialog(
  page: Page,
  prompt: string,
  timeoutMs = specGenTimeoutMs()
) {
  await page.getByTestId('todo-generate-spec-all').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Generate all spec layers')
  await dialog.getByRole('textbox').fill(prompt)
  await runGenerateSpecDialog(page, timeoutMs)
}
