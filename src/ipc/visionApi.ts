/**
 * Sole integration path: Vision HTTP API (same in browser and desktop).
 */

import { invoke } from '@tauri-apps/api/core'
import type { AiderConfig } from './config'
import type { CoreEventBase } from './events'
import type { CoreSessionInfo } from './httpClient'
import { CoreHttpClient } from './httpClient'
import { waitForVisionApi } from './health'
import { isTauriRuntime } from './isTauri'
import type { ProcessUpdate } from '../progress/types'

export type CoreEventHandler = (event: CoreEventBase) => void
export type ProcessPhaseHandler = (update: ProcessUpdate) => void

export interface VisionApiSession {
  start(config: AiderConfig): Promise<CoreSessionInfo>
  stop(): Promise<void>
  send(content: string): Promise<void>
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

  return {
    getApiUrl: () => apiUrl,
    getSessionInfo: () => sessionInfo,
    getHttpClient: () => client,
    getSessionId: () => sessionId,

    async start(cfg) {
      onPhase?.({ phase: 'booting_api', label: 'Starting engine', progress: null })
      let url = cfg.coreApiUrl
      if (isTauriRuntime()) {
        onPhase?.({ phase: 'booting_api', label: 'Spawning core API', detail: cfg.coreEnginePath, progress: 0.2 })
        url = await invoke<string>('start_core_api', {
          workingDir: cfg.workingDir,
          coreEnginePath: cfg.coreEnginePath,
          pythonPath: cfg.pythonPath,
          extraParams: cfg.extraParams,
          port: 8741,
        })
        desktopStartedServe = true
      }
      apiUrl = url
      client = new CoreHttpClient(url, cfg.coreApiToken || undefined)
      onPhase?.({ phase: 'connecting', label: 'Connecting', detail: url, progress: 0.45 })
      await waitForVisionApi(client)
      onPhase?.({ phase: 'session', label: 'Opening workspace', detail: cfg.workingDir, progress: 0.75 })
      const session = await client.createSession({
        workspace: cfg.workingDir,
        model: cfg.model,
        files: cfg.contextFiles?.length ? cfg.contextFiles : undefined,
      })
      sessionId = session.session_id
      sessionInfo = session
      return session
    },

    async stop() {
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
        await invoke('stop_core_api')
        desktopStartedServe = false
      }
      apiUrl = null
    },

    async send(content) {
      if (!client || !sessionId) {
        throw new Error('Vision API session is not started')
      }
      for await (const event of client.sendMessage(sessionId, content)) {
        onEvent(event)
      }
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
