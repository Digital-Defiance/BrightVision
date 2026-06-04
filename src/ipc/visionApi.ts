/**
 * Sole integration path: Vision HTTP API (same in browser and desktop).
 */

import { invoke } from '@tauri-apps/api/core'
import type { VisionConfig } from './config'
import type { CoreEventBase } from './events'
import { isCoreEvent } from './events'
import type { CoreSessionInfo, ModelRouterApiConfig, SendMessageOptions } from './httpClient'
import { createCoreHttpClient } from './httpClient'
import type { CoreHttpClient } from './httpClient'
import { waitForVisionApi } from './health'
import { isTauriRuntime } from './isTauri'
import { desktopVisionPost } from './desktopVisionApi'
import { desktopVisionSendMessage } from './desktopVisionSse'
import { spawnDesktopVisionApi } from './visionApiSpawn'
import type { ProcessUpdate } from '../progress/types'
import { isUserCancellationError } from '../utils/abort'

async function visionStartError(err: unknown): Promise<Error> {
  const base = err instanceof Error ? err : new Error(String(err))
  if (!isTauriRuntime()) return base
  try {
    const lines = await invoke<string[]>('drain_core_api_logs')
    if (lines.length) {
      const tail = lines.slice(-10).join('\n')
      return new Error(`${base.message}\n\nEngine log:\n${tail}`)
    }
  } catch {
    /* best-effort */
  }
  return base
}

export type CoreEventHandler = (event: CoreEventBase) => void
export type ProcessPhaseHandler = (update: ProcessUpdate) => void

export interface VisionApiSession {
  start(
    config: VisionConfig,
    options?: { modelRouter?: ModelRouterApiConfig }
  ): Promise<CoreSessionInfo>
  stop(): Promise<void>
  send(content: string, options?: SendMessageOptions): Promise<void>
  addFiles(paths: string[]): Promise<{ info: CoreSessionInfo; events: CoreEventBase[] }>
  uploadFiles(files: { filename: string; content_base64: string }[]): Promise<{
    info: CoreSessionInfo
    events: CoreEventBase[]
  }>
  cancelSend(): void
  cancelStart(): void
  submitConfirm(confirmId: string, answer: boolean): Promise<void>
  undo(): Promise<void>
  getApiUrl(): string | null
  getSessionInfo(): CoreSessionInfo | null
  getHttpClient(): CoreHttpClient | null
  getSessionId(): string | null
}

export function createVisionApiSession(
  onEvent: CoreEventHandler,
  onPhase?: ProcessPhaseHandler
): VisionApiSession {
  let client: CoreHttpClient | null = null
  let sessionId: string | null = null
  let sessionInfo: CoreSessionInfo | null = null
  let apiUrl: string | null = null
  let apiToken: string | undefined
  let desktopStartedServe = false
  let sendAbort: AbortController | null = null
  let startAbort: AbortController | null = null

  const teardownPartialStart = async () => {
    startAbort?.abort()
    startAbort = null
    if (client && sessionId) {
      try {
        await client.deleteSession(sessionId)
      } catch {
        /* best-effort */
      }
    }
    sessionId = null
    sessionInfo = null
    client = null
    if (desktopStartedServe && isTauriRuntime()) {
      try {
        await invoke('stop_core_api')
      } catch {
        /* best-effort */
      }
      desktopStartedServe = false
    }
    apiUrl = null
  }

  return {
    getApiUrl: () => apiUrl,
    getSessionInfo: () => sessionInfo,
    getHttpClient: () => client,
    getSessionId: () => sessionId,

    async start(cfg, options) {
      startAbort?.abort()
      startAbort = new AbortController()
      const signal = startAbort.signal
      try {
        onPhase?.({ phase: 'booting_api', label: 'Starting engine', progress: null })
        let url = cfg.coreApiUrl
        if (isTauriRuntime()) {
          onPhase?.({
            phase: 'booting_api',
            label: 'Spawning Vision API',
            detail: cfg.coreEnginePath,
            progress: 0.2,
          })
          url = await spawnDesktopVisionApi(cfg)
          desktopStartedServe = true
        }
        if (signal.aborted) throw new DOMException('Start cancelled', 'AbortError')
        apiUrl = url
        apiToken = cfg.coreApiToken?.trim() || undefined
        client = createCoreHttpClient(url, apiToken)
        onPhase?.({ phase: 'connecting', label: 'Connecting', detail: url, progress: 0.45 })
        await waitForVisionApi(client, signal)
        if (signal.aborted) throw new DOMException('Start cancelled', 'AbortError')
        onPhase?.({
          phase: 'session',
          label: 'Opening workspace',
          detail: cfg.workingDir,
          progress: 0.75,
        })
        const sessionBody = {
          workspace: cfg.workingDir,
          model: cfg.model,
          model_router: options?.modelRouter,
          files: cfg.contextFiles?.length ? cfg.contextFiles : undefined,
          auto_yes: false,
          auto_commits: !cfg.promptBeforeCommit,
          session_encrypt: cfg.sessionEncrypt,
          auto_save: cfg.autoSaveSession,
          auto_load: cfg.autoLoadSession,
          auto_save_session_name: cfg.autoSaveSessionName,
          chat_history_file: cfg.chatHistoryFile,
          session_mode: cfg.sessionMode,
        }
        const session = isTauriRuntime()
          ? await invoke<CoreSessionInfo>('create_vision_session', {
              baseUrl: url,
              bearerToken: cfg.coreApiToken?.trim() || null,
              body: {
                stream: true,
                dirty_commits: true,
                dry_run: false,
                ...sessionBody,
              },
            })
          : await client.createSession(sessionBody)
        sessionId = session.session_id
        sessionInfo = session
        return session
      } catch (err) {
        await teardownPartialStart()
        throw await visionStartError(err)
      } finally {
        startAbort = null
      }
    },

    cancelStart() {
      startAbort?.abort()
    },

    async stop() {
      startAbort?.abort()
      startAbort = null
      sendAbort?.abort()
      sendAbort = null
      if (client && sessionId) {
        try {
          await client.deleteSession(sessionId)
        } catch {
          /* best-effort */
        }
      }
      sessionId = null
      sessionInfo = null
      client = null
      if (desktopStartedServe && isTauriRuntime()) {
        try {
          await invoke('stop_core_api')
        } catch {
          /* best-effort */
        }
        desktopStartedServe = false
      }
      apiUrl = null
      apiToken = undefined
    },

    async send(content, options) {
      if (!client || !sessionId || !apiUrl) {
        throw new Error('Vision API session is not started')
      }
      sendAbort?.abort()
      sendAbort = new AbortController()
      const signal = sendAbort.signal
      try {
        const stream = isTauriRuntime()
          ? desktopVisionSendMessage(
              apiUrl,
              sessionId,
              apiToken,
              content,
              options,
              signal
            )
          : client.sendMessage(sessionId, content, signal, options)
        for await (const event of stream) {
          if (!isCoreEvent(event)) continue
          try {
            onEvent(event)
          } catch (err) {
            console.error('[vision] core event handler failed', err, event)
          }
        }
      } catch (err) {
        if (isUserCancellationError(err)) return
        throw err
      } finally {
        sendAbort = null
      }
    },

    async addFiles(paths) {
      if (!client || !sessionId || !apiUrl) {
        throw new Error('Vision API session is not started')
      }
      const result = isTauriRuntime()
        ? await desktopVisionPost<{
            files_in_chat: string[]
            events: CoreEventBase[]
          }>(apiUrl, `sessions/${sessionId}/files`, apiToken, { paths })
        : await client.addSessionFiles(sessionId, paths)
      sessionInfo = {
        session_id: sessionId,
        workspace: sessionInfo?.workspace ?? '',
        model: sessionInfo?.model ?? '',
        files_in_chat: result.files_in_chat,
      }
      for (const event of result.events) {
        if (!isCoreEvent(event)) continue
        try {
          onEvent(event)
        } catch (err) {
          console.error('[vision] core event handler failed', err, event)
        }
      }
      return { info: sessionInfo, events: result.events as CoreEventBase[] }
    },

    async uploadFiles(files) {
      if (!client || !sessionId || !apiUrl) {
        throw new Error('Vision API session is not started')
      }
      const result = isTauriRuntime()
        ? await desktopVisionPost<{
            files_in_chat: string[]
            events: CoreEventBase[]
          }>(apiUrl, `sessions/${sessionId}/files/upload`, apiToken, { files })
        : await client.uploadSessionFiles(sessionId, files)
      sessionInfo = {
        session_id: sessionId,
        workspace: sessionInfo?.workspace ?? '',
        model: sessionInfo?.model ?? '',
        files_in_chat: result.files_in_chat,
      }
      for (const event of result.events) {
        if (!isCoreEvent(event)) continue
        try {
          onEvent(event)
        } catch (err) {
          console.error('[vision] core event handler failed', err, event)
        }
      }
      return { info: sessionInfo, events: result.events as CoreEventBase[] }
    },

    cancelSend() {
      sendAbort?.abort()
      sendAbort = null
      const sid = sessionId
      if (!sid || !apiUrl) return
      if (isTauriRuntime()) {
        void invoke('cancel_vision_message')
        void desktopVisionPost(
          apiUrl,
          `sessions/${sid}/interrupt`,
          apiToken,
          {}
        ).catch(() => {})
      } else {
        void client?.interruptTurn(sid).catch(() => {})
      }
    },

    async submitConfirm(confirmId, answer) {
      if (!client || !sessionId || !apiUrl) {
        throw new Error('Vision API session is not started')
      }
      if (isTauriRuntime()) {
        await desktopVisionPost(apiUrl, `sessions/${sessionId}/confirm`, apiToken, {
          confirm_id: confirmId,
          answer,
        })
      } else {
        await client.submitConfirm(sessionId, confirmId, answer)
      }
    },

    async undo() {
      if (!client || !sessionId || !apiUrl) {
        throw new Error('Vision API session is not started')
      }
      const result = isTauriRuntime()
        ? await desktopVisionPost<{
            events: CoreEventBase[]
            commits: unknown
            last_commit_hash: string | null
          }>(apiUrl, `sessions/${sessionId}/undo`, apiToken, {})
        : await client.undo(sessionId)
      for (const event of result.events) {
        if (!isCoreEvent(event)) continue
        try {
          onEvent(event)
        } catch (err) {
          console.error('[vision] core event handler failed', err, event)
        }
      }
    },
  }
}
