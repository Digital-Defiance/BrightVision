import type { ModelRouteSnapshot } from '../ipc/modelRouterLlm'
import { normalizeModelRouteRole } from '../theme/modelRouterPrefs'

const CODE_TASK =
  /\b(implement|add|fix|create|update|change|patch|write|build)\b/i

const THINK_TASK =
  /\b(architect|refactor|analyze|analyse|debug|root\s+cause|design\s+review|why)\b/i

/** Offer manual escalate when a tier finished without useful progress. */
export function shouldOfferRouterEscalate(
  route: ModelRouteSnapshot | null,
  opts: {
    editedFiles: string[]
    userMessage: string | null
    hadToolError?: boolean
    escalateOnFailureEnabled: boolean
  }
): { offer: boolean; target: 'code' | 'think' } {
  if (!opts.escalateOnFailureEnabled) return { offer: false, target: 'code' }
  if (!route || route.escalated) return { offer: false, target: 'code' }
  if (opts.editedFiles.length > 0) return { offer: false, target: 'code' }
  if (!opts.userMessage?.trim()) return { offer: false, target: 'code' }

  const role = normalizeModelRouteRole(route.role ?? route.tier)
  if (role === 'fast' && CODE_TASK.test(opts.userMessage)) {
    return { offer: true, target: 'code' }
  }
  if (role === 'code' && THINK_TASK.test(opts.userMessage)) {
    return { offer: true, target: 'think' }
  }
  if (opts.hadToolError && role === 'fast') {
    return { offer: true, target: 'code' }
  }
  return { offer: false, target: 'code' }
}
