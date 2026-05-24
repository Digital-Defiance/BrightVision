import { invoke } from '@tauri-apps/api/core'
import { useCallback, useRef, useState } from 'react'
import { DEFAULT_CONFIG, type AiderConfig } from '../ipc/config'
import type { CoreHttpClient, CoreSessionInfo } from '../ipc/httpClient'
import type { CoreEventBase } from '../ipc/events'
import { isTauriRuntime } from '../ipc/isTauri'
import { createVisionApiSession, type VisionApiSession } from '../ipc/visionApi'
import { useProcess } from '../progress/processStore'

export function useAiderSession(onCoreEvent: (event: CoreEventBase) => void) {
  const process = useProcess()
  const [isRunning, setIsRunning] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<CoreSessionInfo | null>(null)
  const [apiUrl, setApiUrl] = useState<string | null>(null)
  const [httpClient, setHttpClient] = useState<CoreHttpClient | null>(null)
  const sessionRef = useRef<VisionApiSession | null>(null)

  const start = useCallback(
    async (config: AiderConfig) => {
      let resolved = config
      if (isTauriRuntime()) {
        const workingDir = await invoke<string>('detect_workspace', {
          hint: config.workingDir || null,
        })
        resolved = { ...config, workingDir }
      }
      const session = createVisionApiSession(onCoreEvent, (update) => process.apply(update))
      try {
        const info = await session.start(resolved)
        process.idle()
        sessionRef.current = session
        setSessionInfo(info)
        setApiUrl(session.getApiUrl())
        setHttpClient(session.getHttpClient())
        setIsRunning(true)
        return { info, workingDir: resolved.workingDir }
      } catch (err) {
        process.fail(err instanceof Error ? err.message : String(err))
        throw err
      }
    },
    [onCoreEvent, process]
  )

  const stop = useCallback(async () => {
    process.begin('stopping')
    try {
      if (sessionRef.current) {
        await sessionRef.current.stop()
        sessionRef.current = null
      }
      setIsRunning(false)
      setIsBusy(false)
      setSessionInfo(null)
      setApiUrl(null)
      setHttpClient(null)
      process.idle()
    } catch (err) {
      process.fail(err instanceof Error ? err.message : String(err))
      throw err
    }
  }, [process])

  const send = useCallback(
    async (content: string) => {
      if (!sessionRef.current) throw new Error('Session not started')
      setIsBusy(true)
      process.begin('reasoning', 'Sending', undefined, null)
      try {
        await sessionRef.current.send(content)
      } catch (err) {
        process.fail(err instanceof Error ? err.message : String(err))
        throw err
      } finally {
        setIsBusy(false)
      }
    },
    [process]
  )

  const undo = useCallback(async () => {
    if (!sessionRef.current) throw new Error('Session not started')
    await sessionRef.current.undo()
  }, [])

  return {
    isRunning,
    isBusy,
    sessionInfo,
    apiUrl,
    httpClient,
    start,
    stop,
    send,
    undo,
    defaultConfig: DEFAULT_CONFIG,
  }
}
