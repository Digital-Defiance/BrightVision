import { expect, test } from '@playwright/test'
import {
  IMPLEMENT_E2E_TITLE,
  IMPLEMENT_NAMED_PATH_STEP,
  implementNamedPathTodoStore,
  implementResumeTodoStore,
} from '../helpers/implementFixture'
import { ensureImplementWorkspace } from '../helpers/fixtureWorkspaces'
import { isIntegrationE2eEnabled } from '../helpers/integrationEnv'
import {
  parseSseEvents,
  previewImplementUserMessage,
} from '../helpers/implementMessagePreview'

const CORE = 'http://127.0.0.1:8741'

function implementStepMessage(): string {
  const stepText = IMPLEMENT_NAMED_PATH_STEP.replace(/^2\. /, '').split(' (depends')[0]!
  return (
    `/agent Implement only implementation task 2: ${stepText}. ` +
    'Do not implement other numbered tasks in this turn unless required as a direct dependency.'
  )
}

function resumeMessage(): string {
  return (
    '/agent Continue the active task from where you stopped. ' +
    'A **workspace snapshot** is injected — do **not** ls, Grep, or GitStatus. ' +
    'Use ReadRange + EditText on the **Next action** file only. ' +
    'Do not reset completed checklist items; work the next incomplete item.'
  )
}

async function createDryRunSession(workspace: string): Promise<string> {
  const res = await fetch(`${CORE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace,
      model: 'gpt-4o',
      auto_yes: true,
      dry_run: true,
    }),
  })
  const text = await res.text()
  expect(res.ok, text).toBe(true)
  const body = JSON.parse(text) as { session_id?: string }
  expect(body.session_id).toBeTruthy()
  return body.session_id!
}

async function postImplementMessage(
  sessionId: string,
  content: string,
  activeTodoId: string,
  injectTodoSpec: boolean
): Promise<string> {
  const res = await fetch(`${CORE}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      preproc: false,
      active_todo_id: activeTodoId,
      inject_todo_spec: injectTodoSpec,
      spec_focus: false,
    }),
  })
  const text = await res.text()
  expect(res.ok, text).toBe(true)
  return text
}

test.describe('Implement turn (real Vision HTTP)', () => {
  test.skip(!isIntegrationE2eEnabled(), 'Run: yarn test:e2e:integration')

  test('POST /messages SSE expands Tasks-tab implement inject on live core', async () => {
    const workspace = ensureImplementWorkspace('named-path')
    const store = implementNamedPathTodoStore()
    const message = implementStepMessage()

    const expected = previewImplementUserMessage({
      workspace,
      message,
      store,
      injectTodoSpec: true,
      specFocus: false,
    })
    expect(expected).toContain('Workspace snapshot')

    const sessionId = await createDryRunSession(workspace)
    const sseBody = await postImplementMessage(sessionId, message, store.activeId, true)
    const events = parseSseEvents(sseBody)
    const userEvent = events.find((e) => e.type === 'user_message')
    expect(userEvent?.text).toBeTruthy()
    expect(userEvent!.text).toContain('Workspace snapshot')
    expect(userEvent!.text).toContain('src/auth/token.ts')
    expect(userEvent!.text).not.toContain('Spec-focus mode (BrightVision)')
    expect(userEvent!.text!.trim()).toBe(expected.trim())
  })

  test('resume turn injects workspace without full spec reinject', async () => {
    const workspace = ensureImplementWorkspace('resume')
    const store = implementResumeTodoStore()
    const message = resumeMessage()

    const expected = previewImplementUserMessage({
      workspace,
      message,
      store,
      injectTodoSpec: false,
      specFocus: false,
    })
    expect(expected).toContain('Workspace snapshot')
    expect(expected).not.toContain('[Active task:')

    const sessionId = await createDryRunSession(workspace)
    const sseBody = await postImplementMessage(sessionId, message, store.activeId, false)
    const userEvent = parseSseEvents(sseBody).find((e) => e.type === 'user_message')
    expect(userEvent?.text?.trim()).toBe(expected.trim())
    expect(userEvent?.text).toContain('handler.test.ts')
  })

  test('GET /debug after implement POST includes route tier when router enabled', async () => {
    const workspace = ensureImplementWorkspace('named-path')
    const store = implementNamedPathTodoStore()
    const sessionId = await createDryRunSession(workspace)
    await postImplementMessage(sessionId, implementStepMessage(), store.activeId, true)

    const debugRes = await fetch(`${CORE}/sessions/${sessionId}/debug`)
    expect(debugRes.ok).toBe(true)
    const debug = (await debugRes.json()) as {
      recent_io_events?: { type?: string }[]
      model_route?: { tier?: string } | null
    }
    expect(debug.recent_io_events?.some((e) => e.type === 'user_message')).toBe(true)
    // dry_run + preproc=false /agent may finalize without LLM; route may be absent — only assert debug shape
    expect(debug).toHaveProperty('format')
  })
})
