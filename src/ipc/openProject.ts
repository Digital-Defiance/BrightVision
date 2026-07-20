/** Open-project persistence (separate from model/API settings). */

import { normalizeWorkspacePath } from '../utils/workspacePath'

export const CURRENT_PROJECT_KEY = 'vision-current-project'
export const RECENT_PROJECTS_KEY = 'vision-recent-projects'
/** Automation / Playwright: skip the launch gate and use stored project. */
export const PROJECT_GATE_SKIP_KEY = 'vision-skip-project-gate'

export const MAX_RECENT_PROJECTS = 10

export function loadCurrentProject(): string | null {
  try {
    const raw = localStorage.getItem(CURRENT_PROJECT_KEY)?.trim()
    return raw ? normalizeWorkspacePath(raw) : null
  } catch {
    return null
  }
}

export function saveCurrentProject(path: string): void {
  const normalized = normalizeWorkspacePath(path)
  localStorage.setItem(CURRENT_PROJECT_KEY, normalized)
}

export function loadRecentProjects(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'string' || !item.trim()) continue
      const p = normalizeWorkspacePath(item)
      if (seen.has(p)) continue
      seen.add(p)
      out.push(p)
    }
    return out.slice(0, MAX_RECENT_PROJECTS)
  } catch {
    return []
  }
}

export function recordRecentProject(path: string): string[] {
  const normalized = normalizeWorkspacePath(path)
  const prev = loadRecentProjects().filter((p) => p !== normalized)
  const next = [normalized, ...prev].slice(0, MAX_RECENT_PROJECTS)
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next))
  return next
}

export function projectDisplayName(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1]! : normalized || '.'
}

export function shouldSkipProjectGate(): boolean {
  try {
    return localStorage.getItem(PROJECT_GATE_SKIP_KEY) === '1'
  } catch {
    return false
  }
}
