import { BRIGHTVISION_GITHUB_REPO } from '../brand'

export interface GithubReleaseInfo {
  /** Normalized semver (no leading `v`). */
  version: string
  tagName: string
  url: string
  name: string
}

export interface ParsedBrightVersion {
  major: number
  minor: number
  patch: number
  /** Undefined when tag has no `-brightN` suffix. */
  bright?: number
}

/** Parse BrightVision tags like `0.2.4-bright2` or `v0.2.5`. */
export function parseBrightVisionVersion(raw: string): ParsedBrightVersion | null {
  const v = raw.trim().replace(/^v/i, '')
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-bright(\d+))?$/i.exec(v)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    bright: m[4] != null ? Number(m[4]) : undefined,
  }
}

/** True when `latest` is strictly newer than `current` (both BrightVision-style tags). */
export function isNewerAppVersion(latest: string, current: string): boolean {
  const a = parseBrightVisionVersion(latest)
  const b = parseBrightVisionVersion(current)
  if (!a || !b) return false
  if (a.major !== b.major) return a.major > b.major
  if (a.minor !== b.minor) return a.minor > b.minor
  if (a.patch !== b.patch) return a.patch > b.patch
  const aBright = a.bright ?? 0
  const bBright = b.bright ?? 0
  return aBright > bBright
}

function parseGithubReleasePayload(data: {
  tag_name?: string
  html_url?: string
  name?: string
  draft?: boolean
}): GithubReleaseInfo | null {
  if (data.draft || !data.tag_name || !data.html_url) return null
  const version = data.tag_name.trim().replace(/^v/i, '')
  if (!parseBrightVisionVersion(version)) return null
  return {
    version,
    tagName: data.tag_name,
    url: data.html_url,
    name: (data.name ?? data.tag_name).trim(),
  }
}

async function fetchGithubJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Latest published GitHub release for the BrightVision desktop app.
 * Uses `/releases/latest`, then falls back to the newest non-draft release.
 */
export async function fetchLatestGithubRelease(
  repo: string = BRIGHTVISION_GITHUB_REPO
): Promise<GithubReleaseInfo | null> {
  const latest = await fetchGithubJson(`https://api.github.com/repos/${repo}/releases/latest`)
  if (latest && typeof latest === 'object') {
    const parsed = parseGithubReleasePayload(latest as Record<string, unknown>)
    if (parsed) return parsed
  }

  const list = await fetchGithubJson(
    `https://api.github.com/repos/${repo}/releases?per_page=12`
  )
  if (!Array.isArray(list)) return null
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const parsed = parseGithubReleasePayload(entry as Record<string, unknown>)
    if (parsed) return parsed
  }
  return null
}

export const APP_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export function shouldCheckForAppUpdate(lastCheckMs: number | null, now = Date.now()): boolean {
  if (lastCheckMs == null || !Number.isFinite(lastCheckMs)) return true
  return now - lastCheckMs >= APP_UPDATE_CHECK_INTERVAL_MS
}
