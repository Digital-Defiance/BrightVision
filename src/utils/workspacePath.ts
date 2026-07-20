/** Normalize workspace paths for stable UI/API comparison (no filesystem resolve). */
export function normalizeWorkspacePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, '/')
  if (!trimmed) return '.'
  const stripped = trimmed.replace(/\/+$/, '')
  return stripped || '/'
}

export function workspacePathsEqual(a: string, b: string): boolean {
  return normalizeWorkspacePath(a) === normalizeWorkspacePath(b)
}
