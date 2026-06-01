import { startRealCoreServer } from './helpers/realCoreServer'
import { isIntegrationE2eEnabled } from './helpers/integrationEnv'

export default async function globalSetup(): Promise<void> {
  if (!isIntegrationE2eEnabled()) return
  await startRealCoreServer()
}
