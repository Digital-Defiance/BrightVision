import { stopRealCoreServer } from './helpers/realCoreServer'
import { isIntegrationE2eEnabled } from './helpers/integrationEnv'

export default async function globalTeardown(): Promise<void> {
  if (!isIntegrationE2eEnabled()) return
  await stopRealCoreServer()
}
