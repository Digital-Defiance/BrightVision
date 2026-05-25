import { startRealCoreServer } from './helpers/realCoreServer'
import { isLlmE2eEnabled } from './helpers/llmEnv'

export default async function globalSetup(): Promise<void> {
  if (!isLlmE2eEnabled()) return
  await startRealCoreServer()
}
