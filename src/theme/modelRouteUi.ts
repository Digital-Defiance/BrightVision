import type { Theme } from '@mui/material/styles'
import type { ModelRouteSnapshot } from '../ipc/modelRouterLlm'
import { normalizeModelRouteRole, type ModelRouteRole } from './modelRouterPrefs'

export function modelRouteRoleLabel(role: ModelRouteRole): string {
  if (role === 'fast') return 'Fighter pilot'
  if (role === 'think') return 'Architect'
  return 'Engineer'
}

export function modelRouteRoleFromSnapshot(
  route: Pick<ModelRouteSnapshot, 'tier' | 'role'>
): ModelRouteRole {
  return normalizeModelRouteRole(route.role ?? route.tier)
}

export function modelRouteAccentColor(theme: Theme, role: ModelRouteRole): string {
  if (role === 'fast') return theme.palette.success.main
  if (role === 'think') return theme.palette.info.main
  return theme.palette.warning.main
}

/** Hover tooltip on the assistant message tier edge. */
export function formatModelRouteTooltip(route: ModelRouteSnapshot): string {
  const role = modelRouteRoleFromSnapshot(route)
  const label = modelRouteRoleLabel(role)
  const model = (route.model ?? '').replace(/^ollama_chat\//, '') || 'model'
  const think =
    route.enable_thinking === true
      ? ' · think on'
      : route.enable_thinking === false
        ? ' · think off'
        : ''
  const swap =
    route.load_ms != null && route.load_ms > 0
      ? ` · swap ${route.load_ms}ms${route.swapped ? ' (unload+load)' : ''}`
      : ''
  return `${label}: ${model}${think}${swap}`
}

export function isLegacyModelRouterSystemMessage(content: string): boolean {
  return content.startsWith('Model router:')
}
