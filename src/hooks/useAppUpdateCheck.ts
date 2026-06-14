import { useCallback, useEffect, useMemo, useState } from 'react'
import { isTauriRuntime } from '../ipc/isTauri'
import {
  APP_UPDATE_DISMISSED_VERSION_KEY,
  APP_UPDATE_LAST_CHECK_KEY,
  readStorageItem,
} from '../storageKeys'
import {
  fetchLatestGithubRelease,
  isNewerAppVersion,
  shouldCheckForAppUpdate,
  type GithubReleaseInfo,
} from '../utils/appUpdateCheck'

const isE2eBuild = import.meta.env.E2E === 'true'

function loadDismissedVersion(): string | null {
  return readStorageItem(APP_UPDATE_DISMISSED_VERSION_KEY)
}

function loadLastCheckMs(): number | null {
  const raw = readStorageItem(APP_UPDATE_LAST_CHECK_KEY)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function saveDismissedVersion(version: string): void {
  localStorage.setItem(APP_UPDATE_DISMISSED_VERSION_KEY, version)
}

function recordUpdateCheckTime(now = Date.now()): void {
  localStorage.setItem(APP_UPDATE_LAST_CHECK_KEY, String(now))
}

export function useAppUpdateCheck(
  currentVersion: string | null,
  options?: { recheck?: boolean }
) {
  const [release, setRelease] = useState<GithubReleaseInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    loadDismissedVersion()
  )

  const enabled = isTauriRuntime() && !isE2eBuild && Boolean(currentVersion)

  const refresh = useCallback(async () => {
    if (!enabled || !currentVersion) return
    setChecking(true)
    try {
      const latest = await fetchLatestGithubRelease()
      recordUpdateCheckTime()
      setRelease(latest)
    } finally {
      setChecking(false)
    }
  }, [enabled, currentVersion])

  useEffect(() => {
    if (!enabled || !currentVersion) return
    if (!options?.recheck && !shouldCheckForAppUpdate(loadLastCheckMs())) return
    void refresh()
  }, [enabled, currentVersion, refresh, options?.recheck])

  const updateAvailable = useMemo(() => {
    if (!enabled || !currentVersion || !release) return false
    if (dismissedVersion === release.version) return false
    return isNewerAppVersion(release.version, currentVersion)
  }, [enabled, currentVersion, release, dismissedVersion])

  const dismiss = useCallback(() => {
    if (!release) return
    saveDismissedVersion(release.version)
    setDismissedVersion(release.version)
  }, [release])

  return {
    release,
    updateAvailable,
    checking,
    dismiss,
    refresh,
  }
}
