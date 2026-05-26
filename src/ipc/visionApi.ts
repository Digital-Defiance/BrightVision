/**
 * Sole integration path: Vision HTTP API (same in browser and desktop).
 */

import { invoke } from '@tauri-apps/api/core'
import { invokeWithTimeout } from './tauriInvoke'
import type { VisionConfig } from './config'
import type { CoreEventBase } from './events'
import type { CoreSessionInfo, ModelRouterApiConfig, SendMessageOptions } from './httpClient'
import { CoreHttpClient } from './httpClient'
import { waitForVisionApi } from './health'
import { isTauriRuntime } from './isTauri'
import type { ProcessUpdate } from '../progress/types'

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
            label: 'Spawning core API',
            detail: cfg.coreEnginePath,
            progress: 0.2,
          })
          url = await invokeWithTimeout<string>('start_core_api', {
            workingDir: cfg.workingDir,
            coreEnginePath: cfg.coreEnginePath,
            pythonPath: cfg.pythonPath,
            extraParams: cfg.extraParams,
            ollamaApiBase: cfg.ollamaApiBase,
            port: 8741,
          })
          desktopStartedServe = true
        }
        if (signal.aborted) throw new DOMException('Start cancelled', 'AbortError')
        apiUrl = url
        client = new CoreHttpClient(url, cfg.coreApiToken || undefined)
        onPhase?.({ phase: 'connecting', label: 'Connecting', detail: url, progress: 0.45 })
        await waitForVisionApi(client, signal)
        if (signal.aborted) throw new DOMException('Start cancelled', 'AbortError')
        onPhase?.({
          phase: 'session',
          label: 'Opening workspace',
          detail: cfg.workingDir,
          progress: 0.75,
        })
        const session = await client.createSession({
          workspace: cfg.workingDir,
          model: cfg.model,
          model_router: options?.modelRouter,
          files: cfg.contextFiles?.length ? cfg.contextFiles : undefined,
          auto_yes: false,
          auto_commits: !cfg.promptBeforeCommit,
        })
        sessionId = session.session_id
        sessionInfo = session
        return session
      } catch (err) {
        await teardownPartialStart()
        throw err
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
    },

    async send(content, options) {
      if (!client || !sessionId) {
        throw new Error('Vision API session is not started')
      }
      sendAbort?.abort()
      sendAbort = new AbortController()
      const signal = sendAbort.signal
      try {
        for await (const event of client.sendMessage(sessionId, content, signal, options)) {
          onEvent(event)
        }
      } finally {
        sendAbort = null
      }
    },

    async addFiles(paths) {
      if (!client || !sessionId) {
        throw new Error('Vision API session is not started')
      }
      const result = await client.addSessionFiles(sessionId, paths)
      sessionInfo = {
        session_id: sessionId,
        workspace: sessionInfo?.workspace ?? '',
        model: sessionInfo?.model ?? '',
        files_in_chat: result.files_in_chat,
      }
      for (const event of result.events) {
        onEvent(event as CoreEventBase)
      }
      return { info: sessionInfo, events: result.events as CoreEventBase[] }
    },

    async uploadFiles(files) {
      if (!client || !sessionId) {
        throw new Error('Vision API session is not started')
      }
      const result = await client.uploadSessionFiles(sessionId, files)
      sessionInfo = {
        session_id: sessionId,
        workspace: sessionInfo?.workspace ?? '',
        model: sessionInfo?.model ?? '',
        files_in_chat: result.files_in_chat,
      }
      for (const event of result.events) {
        onEvent(event as CoreEventBase)
      }
      return { info: sessionInfo, events: result.events as CoreEventBase[] }
    },

    cancelSend() {
      sendAbort?.abort()
      sendAbort = null
    },

    async submitConfirm(confirmId, answer) {
      if (!client || !sessionId) {
        throw new Error('Vision API session is not started')
      }
      await client.submitConfirm(sessionId, confirmId, answer)
    },

    async undo() {
      if (!client || !sessionId) {
        throw new Error('Vision API session is not started')
      }
      const result = await client.undo(sessionId)
      for (const event of result.events) {
        onEvent(event as CoreEventBase)
      }
    },
  }
}
