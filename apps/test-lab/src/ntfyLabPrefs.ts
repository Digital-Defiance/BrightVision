const STORAGE_KEY = 'bright-vision-test-lab-ntfy'

export const DEFAULT_NTFY_SERVER = 'https://ntfy.sh'

export interface TestLabNtfyPrefs {
  enabled: boolean
  serverBase: string
  topic: string
}

export const DEFAULT_TEST_LAB_NTFY_PREFS: TestLabNtfyPrefs = {
  enabled: false,
  serverBase: DEFAULT_NTFY_SERVER,
  topic: '',
}

export function generateNtfyTopic(): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `bv_lab_${id}`
}

function ensureTopic(topic: string | undefined): string {
  const t = topic?.trim()
  return t ? t : generateNtfyTopic()
}

export function ntfySubscribeUrl(prefs: Pick<TestLabNtfyPrefs, 'serverBase' | 'topic'>): string {
  const base = (prefs.serverBase.trim() || DEFAULT_NTFY_SERVER).replace(/\/+$/, '')
  return `${base}/${encodeURIComponent(prefs.topic.trim())}`
}

export function ntfyAppSubscribeUrl(prefs: Pick<TestLabNtfyPrefs, 'serverBase' | 'topic'>): string {
  const serverBase = (prefs.serverBase.trim() || DEFAULT_NTFY_SERVER).replace(/\/+$/, '')
  const host = serverBase.replace(/^https?:\/\//, '')
  const topic = encodeURIComponent(prefs.topic.trim())
  const params = new URLSearchParams({ display: 'BrightVision Test Lab' })
  if (serverBase.startsWith('http://')) {
    params.set('secure', 'false')
  }
  return `ntfy://${host}/${topic}?${params.toString()}`
}

export function loadTestLabNtfyPrefs(): TestLabNtfyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_TEST_LAB_NTFY_PREFS, topic: generateNtfyTopic() }
    }
    const parsed = JSON.parse(raw) as Partial<TestLabNtfyPrefs>
    return {
      ...DEFAULT_TEST_LAB_NTFY_PREFS,
      ...parsed,
      topic: ensureTopic(parsed.topic),
      serverBase: (parsed.serverBase?.trim() || DEFAULT_NTFY_SERVER).replace(/\/+$/, ''),
    }
  } catch {
    return { ...DEFAULT_TEST_LAB_NTFY_PREFS, topic: generateNtfyTopic() }
  }
}

export function saveTestLabNtfyPrefs(prefs: TestLabNtfyPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function formatSuiteRunNtfyMessage(opts: {
  ok: boolean
  elapsedSeconds: number
  totalSeconds: number
  failedSteps: string[]
}): string {
  const status = opts.ok ? 'PASSED' : 'FAILED'
  const lines = [
    `Status: ${status}`,
    `Wall time: ${Math.round(opts.elapsedSeconds)}s`,
    `Step CPU time: ${Math.round(opts.totalSeconds)}s`,
  ]
  if (opts.failedSteps.length) {
    lines.push(`Failed: ${opts.failedSteps.join(', ')}`)
  }
  return lines.join('\n')
}
