const STORAGE_KEY = 'bright-vision-test-lab-lab-remote'

export interface TestLabLabRemotePrefs {
  enabled: boolean
  proxyPort: number
}

export const DEFAULT_TEST_LAB_LAB_REMOTE_PREFS: TestLabLabRemotePrefs = {
  enabled: false,
  proxyPort: 8744,
}

export function loadTestLabLabRemotePrefs(): TestLabLabRemotePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TEST_LAB_LAB_REMOTE_PREFS }
    const parsed = JSON.parse(raw) as Partial<TestLabLabRemotePrefs>
    return { ...DEFAULT_TEST_LAB_LAB_REMOTE_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_TEST_LAB_LAB_REMOTE_PREFS }
  }
}

export function saveTestLabLabRemotePrefs(prefs: TestLabLabRemotePrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}
