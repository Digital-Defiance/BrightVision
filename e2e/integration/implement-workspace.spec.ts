import { expect, test } from '@playwright/test'
import {
  IMPLEMENT_E2E_TITLE,
  IMPLEMENT_NAMED_PATH_STEP,
  implementNamedPathTodoStore,
  implementPathlessTodoStore,
  implementResumeTodoStore,
} from '../helpers/implementFixture'
import { previewImplementBlock } from '../helpers/implementBlockPreview'
import { previewImplementUserMessage } from '../helpers/implementMessagePreview'
import { ensureImplementWorkspace } from '../helpers/fixtureWorkspaces'
import { isIntegrationE2eEnabled } from '../helpers/integrationEnv'

test.describe('Implement workspace inject (fixture pack + cecli)', () => {
  test('named-path step injects checklist path and ContextManager create guidance', () => {
    const root = ensureImplementWorkspace('named-path')
    const store = implementNamedPathTodoStore()
    const checklist = store.todos[0]!.checklist!

    const block = previewImplementBlock({
      workspace: root,
      checklist,
      resume: false,
      activeTaskTitle: IMPLEMENT_E2E_TITLE,
      message: `/agent Implement only implementation task 2: ${IMPLEMENT_NAMED_PATH_STEP.replace(/^2\. /, '').split(' (depends')[0]}.`,
    })

    expect(block).toContain('Workspace snapshot')
    expect(block).toContain('orientation only')
    expect(block).toContain('src/auth/token.ts')
    expect(block).toContain('ContextManager create')
    expect(block).not.toMatch(/\bexpo\/\b/)
    expect(block).not.toMatch(/\bwp\/\b/)
  })

  test('full user message inject matches Session path (not block-only)', () => {
    const root = ensureImplementWorkspace('named-path')
    const store = implementNamedPathTodoStore()
    const stepText = IMPLEMENT_NAMED_PATH_STEP.replace(/^2\. /, '').split(' (depends')[0]!
    const message =
      `/agent Implement only implementation task 2: ${stepText}. ` +
      'Do not implement other numbered tasks in this turn unless required as a direct dependency.'

    const full = previewImplementUserMessage({
      workspace: root,
      message,
      store,
      injectTodoSpec: true,
      specFocus: false,
    })
    const blockOnly = previewImplementBlock({
      workspace: root,
      checklist: store.todos[0]!.checklist!,
      resume: false,
      activeTaskTitle: IMPLEMENT_E2E_TITLE,
      message,
    })

    expect(full).toContain(blockOnly)
    expect(full).toContain('Requirements (summary)')
    expect(full).toContain('Workspace snapshot')
    expect(full).not.toContain('Spec-focus mode (BrightVision)')
  })

  test('pathless step 1 points at implementation tasks instead of layout guessing', () => {
    const root = ensureImplementWorkspace('pathless')
    const store = implementPathlessTodoStore()
    const checklist = store.todos[0]!.checklist!

    const block = previewImplementBlock({
      workspace: root,
      checklist,
      resume: false,
    })

    expect(block).toContain('names **no file paths**')
    expect(block).toContain('## Implementation tasks')
    expect(block).toContain('orientation only')
    expect(block).not.toContain('ContextManager add these entries')
  })

  test('resume snapshot lists top-level only and focuses open step', () => {
    const root = ensureImplementWorkspace('resume')
    const store = implementResumeTodoStore()
    const checklist = store.todos[0]!.checklist!

    const block = previewImplementBlock({
      workspace: root,
      checklist,
      resume: true,
      activeTaskTitle: IMPLEMENT_E2E_TITLE,
    })

    expect(block).toContain('`lib/`')
    expect(block).toContain('`src/`')
    expect(block).not.toContain('src/api/handler.ts` exists')
    expect(block).toContain('handler.test.ts')
  })
})

test.describe('Implement workspace inject (real core preflight)', () => {
  test.skip(!isIntegrationE2eEnabled(), 'Run: yarn test:e2e:integration')

  test('fixture pack workspace is git-clean enough for Vision sessions', () => {
    const root = ensureImplementWorkspace('named-path')
    expect(root).toContain('implement-workspace')
    const block = previewImplementBlock({
      workspace: root,
      checklist: implementNamedPathTodoStore().todos[0]!.checklist!,
    })
    expect(block.length).toBeGreaterThan(200)
  })
})
