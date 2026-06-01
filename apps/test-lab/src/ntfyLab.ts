import { invoke } from '@tauri-apps/api/core'
import {
  formatSuiteRunNtfyMessage,
  type TestLabNtfyPrefs,
} from './ntfyLabPrefs'

export async function sendTestLabNtfyPush(
  prefs: Pick<TestLabNtfyPrefs, 'serverBase' | 'topic'>,
  title: string,
  message: string,
  priority: 'default' | 'high' = 'default'
): Promise<void> {
  await invoke('ntfy_send_push', {
    serverBase: prefs.serverBase,
    topic: prefs.topic.trim(),
    title,
    message,
    priority,
  })
}

export async function sendTestLabNtfyTestPing(prefs: TestLabNtfyPrefs): Promise<void> {
  await sendTestLabNtfyPush(
    prefs,
    'BrightVision Test Lab',
    'Test notification from Test Lab. Scan the QR code in Settings to subscribe on your phone.',
    'default'
  )
}

export async function maybeNotifySuiteRunFinished(
  prefs: TestLabNtfyPrefs,
  opts: {
    ok: boolean
    elapsedSeconds: number
    totalSeconds: number
    failedStepIds: string[]
  }
): Promise<void> {
  if (!prefs.enabled || !prefs.topic.trim()) return
  const title = opts.ok ? 'Test Lab: suite passed' : 'Test Lab: suite failed'
  const message = formatSuiteRunNtfyMessage({
    ok: opts.ok,
    elapsedSeconds: opts.elapsedSeconds,
    totalSeconds: opts.totalSeconds,
    failedSteps: opts.failedStepIds,
  })
  try {
    await sendTestLabNtfyPush(prefs, title, message, opts.ok ? 'default' : 'high')
  } catch {
    /* best-effort */
  }
}
