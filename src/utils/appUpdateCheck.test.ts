import { describe, expect, it, vi } from 'vitest'
import {
  fetchLatestGithubRelease,
  isNewerAppVersion,
  parseBrightVisionVersion,
  shouldCheckForAppUpdate,
} from './appUpdateCheck'

describe('parseBrightVisionVersion', () => {
  it('parses bright suffix tags', () => {
    expect(parseBrightVisionVersion('v0.2.4-bright2')).toEqual({
      major: 0,
      minor: 2,
      patch: 4,
      bright: 2,
    })
  })

  it('parses plain semver tags', () => {
    expect(parseBrightVisionVersion('0.2.5')).toEqual({
      major: 0,
      minor: 2,
      patch: 5,
      bright: undefined,
    })
  })
})

describe('isNewerAppVersion', () => {
  it('compares bright build numbers on the same patch', () => {
    expect(isNewerAppVersion('0.2.4-bright3', '0.2.4-bright2')).toBe(true)
    expect(isNewerAppVersion('0.2.4-bright2', '0.2.4-bright2')).toBe(false)
  })

  it('compares patch releases', () => {
    expect(isNewerAppVersion('0.2.5-bright1', '0.2.4-bright9')).toBe(true)
  })

  it('returns false for unknown tag shapes', () => {
    expect(isNewerAppVersion('latest', '0.2.4-bright2')).toBe(false)
  })
})

describe('shouldCheckForAppUpdate', () => {
  it('checks immediately when never checked', () => {
    expect(shouldCheckForAppUpdate(null)).toBe(true)
  })

  it('waits until the interval elapses', () => {
    const now = 1_000_000
    expect(shouldCheckForAppUpdate(now - 60_000, now)).toBe(false)
    expect(shouldCheckForAppUpdate(now - 25 * 60 * 60 * 1000, now)).toBe(true)
  })
})

describe('fetchLatestGithubRelease', () => {
  it('parses /releases/latest payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v0.2.4-bright3',
        html_url: 'https://github.com/Digital-Defiance/BrightVision/releases/tag/v0.2.4-bright3',
        name: '0.2.4 bright3',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const release = await fetchLatestGithubRelease()
    expect(release?.version).toBe('0.2.4-bright3')
    expect(release?.url).toContain('/releases/tag/')

    vi.unstubAllGlobals()
  })
})
