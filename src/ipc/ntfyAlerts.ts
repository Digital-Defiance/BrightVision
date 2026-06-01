import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './isTauri'
import {
  formatSpecJobCompleteNtfyBody,
  formatTurnCompleteNtfyBody,
  ntfyPriorityForDuration,
  ntfyPushTitle,
  shouldSendNtfyTurnAlert,
  type NtfyAlertsPrefs,
  type SpecJobNtfyOutcome,
  type SpecJobNtfySection,
} from '../theme/ntfyAlertsPrefs'

export async function sendNtfyPush(
  prefs: Pick<NtfyAlertsPrefs, 'serverBase' | 'topic'>,
  title: string,
  message: string,
  priority: 'default' | 'high' | 'low' | 'min' | 'max' | 'urgent' = 'default'
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('ntfy push requires the desktop app')
  }
  await invoke('ntfy_send_push', {
    serverBase: prefs.serverBase,
    topic: prefs.topic.trim(),
    title,
    message,
    priority,
  })
}

export async function sendNtfyTestPing(prefs: NtfyAlertsPrefs): Promise<void> {
  await sendNtfyPush(
    prefs,
    ntfyPushTitle(),
    'Test notification from BrightVision. Subscribe on your phone with the topic below.',
    'default'
  )
}

export async function maybeNotifyTurnComplete(
  prefs: NtfyAlertsPrefs,
  opts: {
    durationMs: number
    queuedRemaining: number
    editedCount: number
    documentVisible: boolean
  }
): Promise<void> {
  if (!shouldSendNtfyTurnAlert(prefs, opts)) return
  const message = formatTurnCompleteNtfyBody(opts)
  const priority = ntfyPriorityForDuration(opts.durationMs)
  try {
    await sendNtfyPush(prefs, ntfyPushTitle(), message, priority)
  } catch {
    /* best-effort — do not interrupt the chat turn */
  }
}

export async function maybeNotifySpecJobComplete(
  prefs: NtfyAlertsPrefs,
  opts: {
    durationMs: number
    documentVisible: boolean
    mode: 'generate' | 'refine'
    section: SpecJobNtfySection
    taskTitle?: string
    outcome: SpecJobNtfyOutcome
  }
): Promise<void> {
  if (!shouldSendNtfyTurnAlert(prefs, { durationMs: opts.durationMs, documentVisible: opts.documentVisible })) {
    return
  }
  const message = formatSpecJobCompleteNtfyBody(opts)
  const priority = ntfyPriorityForDuration(opts.durationMs)
  try {
    await sendNtfyPush(prefs, ntfyPushTitle(), message, priority)
  } catch {
    /* best-effort */
  }
}
