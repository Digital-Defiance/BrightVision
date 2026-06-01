import fs from 'node:fs'

/** Canonical workspace path for mock `workspace` query matching (macOS /Volumes vs /private/Volumes). */
export function normalizeWorkspacePath(p: string): string {
  let s = p.replace(/\\/g, '/').replace(/\/$/, '')
  try {
    if (fs.existsSync(s)) {
      s = fs.realpathSync.native(s)
    }
  } catch {
    /* keep s */
  }
  return s.replace(/\\/g, '/').replace(/\/$/, '')
}
