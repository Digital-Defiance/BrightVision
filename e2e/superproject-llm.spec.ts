import { expect, test } from '@playwright/test'
import { assistantText } from './helpers/llmSse'
import {
  assertCoreHealthOk,
  createCoreSession,
  streamSessionMessage,
} from './helpers/llmApi'
import {
  assertOllamaForLlmE2e,
  isLlmE2eEnabled,
  isSuperprojectLlmEnabled,
  superprojectLlmReadmeRel,
  superprojectLlmWorkspace,
  SUPERPROJECT_README_HEADING,
} from './helpers/llmEnv'

const SESSION_CREATE_MS = 600_000
const TURN_MS = 480_000

test.describe.configure({ mode: 'serial', timeout: SESSION_CREATE_MS + TURN_MS + 120_000 })

test.describe('LLM superproject workspace @superproject', () => {
  test.skip(!isLlmE2eEnabled(), 'Run: yarn test:e2e:llm')
  test.skip(!isSuperprojectLlmEnabled(), 'Run with E2E_SUPERPROJECT_LLM=1 (slow repo map)')

  test.beforeAll(async () => {
    await assertOllamaForLlmE2e()
  })

  test('reads heading from bright_vision_core/README.md in repo root workspace', async () => {
    await assertCoreHealthOk()
    const workspace = superprojectLlmWorkspace()
    const rel = superprojectLlmReadmeRel()
    const question = [
      `Using only ${rel}, what is the markdown H1 heading (text after #)?`,
      `Reply with only: ${SUPERPROJECT_README_HEADING}`,
    ].join(' ')

    const { sessionId, filesInChat } = await createCoreSession(workspace, {
      files: [rel],
      timeoutMs: SESSION_CREATE_MS,
    })
    expect(filesInChat.map((f) => f.replace(/\\/g, '/'))).toContain(rel)

    const events = await streamSessionMessage(sessionId, question, {
      preproc: false,
      timeoutMs: TURN_MS,
    })
    const reply = assistantText(events).trim()
    expect(
      reply.length,
      `empty assistant reply; events=${events.map((e) => e.type).join(',')}`
    ).toBeGreaterThan(0)
    expect(reply).toMatch(new RegExp(SUPERPROJECT_README_HEADING, 'i'))
  })
})
