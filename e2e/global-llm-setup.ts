import { startRealCoreServer } from './helpers/realCoreServer'
import { isLlmE2eEnabled } from './helpers/llmEnv'

export default async function globalSetup(): Promise<void> {
  process.env['E2E_LLM'] = '1'
  if (!isLlmE2eEnabled()) return
  const phased = process.env['E2E_SPEC_GEN_PHASED'] === '1'
  console.error(
    `[global-llm-setup] E2E_LLM=1 E2E_SPEC_GEN_PHASED=${process.env['E2E_SPEC_GEN_PHASED'] ?? '(unset)'}`
  )
  if (phased) {
    console.error('[global-llm-setup] phased spec-gen file enabled')
  } else {
    console.error('[global-llm-setup] all-layers spec-gen only (default)')
  }
  await startRealCoreServer()
}
