import { stopRealCoreServer } from './helpers/realCoreServer'
import { isLlmE2eEnabled } from './helpers/llmEnv'

export default async function globalTeardown(): Promise<void> {
  if (!isLlmE2eEnabled()) return
  await stopRealCoreServer()
}
