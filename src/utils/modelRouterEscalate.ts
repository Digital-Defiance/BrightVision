import type { ModelRouteSnapshot } from '../ipc/modelRouterLlm'

const CODE_TASK =
  /\b(implement|add|fix|create|update|change|patch|write|build)\b/i

/** Offer manual escalate when fast tier finished without edits on a code-style prompt. */
export function shouldOfferRouterEscalate(
  route: ModelRouteSnapshot | null,
  opts: {
    editedFiles: string[]
    userMessage: string | null
    hadToolError?: boolean
    escalateOnFailureEnabled: boolean
  }
): boolean {
  if (!opts.escalateOnFailureEnabled) return false
  if (!route || route.tier !== 'fast' || route.escalated) return false
  if (opts.editedFiles.length > 0) return false
  if (!opts.userMessage?.trim()) return false
  if (!CODE_TASK.test(opts.userMessage)) return false
  if (opts.hadToolError) return true
  return true
}
