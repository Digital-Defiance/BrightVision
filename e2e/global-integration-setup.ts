import { startRealCoreServer } from './helpers/realCoreServer'
import { isIntegrationE2eEnabled } from './helpers/integrationEnv'

export default async function globalSetup(): Promise<void> {
  if (!isIntegrationE2eEnabled()) return
  // Do not free :4173 here — Playwright starts webServer before globalSetup, and killing
  // the preview causes ERR_CONNECTION_REFUSED. test-local.sh + e2e-preview.sh already
  // free the port before integration runs.
  await startRealCoreServer()
}
