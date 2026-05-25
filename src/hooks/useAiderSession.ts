import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_CONFIG, type AiderConfig } from '../ipc/config'
import type { CoreHttpClient, CoreSessionInfo, SendMessageOptions } from '../ipc/httpClient'
import type { CoreEventBase } from '../ipc/events'
import { isTauriRuntime } from '../ipc/isTauri'
import { createVisionApiSession, type VisionApiSession } from '../ipc/visionApi'
import { useProcess } from '../progress/processStore'

export function useAiderSession(onCoreEvent: (event: CoreEventBase) => void) {
  const process = useProcess()
  const [isRunning, setIsRunning] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [queuedCount, setQueuedCount] = useState(0)
  const [sessionInfo, setSessionInfo] = useState<CoreSessionInfo | null>(null)
  const [apiUrl, setApiUrl] = useState<string | null>(null)
  const [httpClient, setHttpClient] = useState<CoreHttpClient | null>(null)
  const sessionRef = useRef<VisionApiSession | null>(null)
  const pendingStartRef = useRef<VisionApiSession | null>(null)
  const busyRef = useRef(false)
  const queueRef = useRef<string[]>([])
  const drainQueueRef = useRef<() => Promise<void>>(async () => {})

  const syncQueueCount = useCallback(() => {
    setQueuedCount(queueRef.current.length)
  }, [])

  const clearQueue = useCallback(() => {
    queueRef.current = []
    syncQueueCount()
  }, [syncQueueCount])

  const startGenerationRef = useRef(0)

  const start = useCallback(
    async (config: AiderConfig) => {
      const generation = ++startGenerationRef.current
      setIsStarting(true)
      const session = createVisionApiSession(onCoreEvent, (update) => process.apply(update))
      pendingStartRef.current = session
      let resolved = config
      try {
        if (isTauriRuntime()) {
          const workingDir = await invoke<string>('detect_workspace', {
            hint: config.workingDir || null,
          })
          if (generation !== startGenerationRef.current) {
            throw new DOMException('Start superseded', 'AbortError')
          }
          resolved = { ...config, workingDir }
        }
        const info = await session.start(resolved)
        if (generation !== startGenerationRef.current) {
          await session.stop().catch(() => {})
          throw new DOMException('Start superseded', 'AbortError')
        }
        process.idle()
        sessionRef.current = session
        clearQueue()
        setSessionInfo(info)
        setApiUrl(session.getApiUrl())
        setHttpClient(session.getHttpClient())
        setIsRunning(true)
        return { info, workingDir: resolved.workingDir }
      } catch (err) {
        if (generation === startGenerationRef.current) {
          process.fail(err instanceof Error ? err.message : String(err))
        }
        throw err
      } finally {
        if (generation === startGenerationRef.current) {
          pendingStartRef.current = null
          setIsStarting(false)
        }
      }
    },
    [onCoreEvent, process, clearQueue]
  )

  const stop = useCallback(async () => {
    startGenerationRef.current += 1
    process.begin('stopping')
    pendingStartRef.current?.cancelStart()
    sessionRef.current?.cancelSend()
    const pending = pendingStartRef.current
    const active = sessionRef.current
    pendingStartRef.current = null

    const shutdown = async () => {
      if (pending) await pending.stop().catch(() => {})
      if (active) await active.stop().catch(() => {})
      if (isTauriRuntime()) {
        await invoke('stop_core_api').catch(() => {})
      }
    }

    try {
      clearQueue()
      await Promise.race([
        shutdown(),
        new Promise<void>((resolve) => setTimeout(resolve, 8_000)),
      ])
      sessionRef.current = null
      setIsRunning(false)
      setIsBusy(false)
      busyRef.current = false
      setSessionInfo(null)
      setApiUrl(null)
      setHttpClient(null)
    } finally {
      setIsStarting(false)
      process.idle()
    }
  }, [process, clearQueue])

  useEffect(() => {
    return () => {
      startGenerationRef.current += 1
      pendingStartRef.current?.cancelStart()
      void pendingStartRef.current?.stop().catch(() => {})
      void sessionRef.current?.stop().catch(() => {})
    }
  }, [])

  const sendOne = useCallback(
    async (content: string, todoOptions?: SendMessageOptions) => {
      if (!sessionRef.current) throw new Error('Session not started')
      busyRef.current = true
      setIsBusy(true)
      process.begin('reasoning', 'Sending', undefined, null)
      try {
        await sessionRef.current.send(content, todoOptions)
      } catch (err) {
        process.fail(err instanceof Error ? err.message : String(err))
        throw err
      } finally {
        busyRef.current = false
        setIsBusy(false)
        void drainQueueRef.current()
      }
    },
    [process]
  )

  const drainQueue = useCallback(async () => {
    while (queueRef.current.length > 0 && sessionRef.current && !busyRef.current) {
      const next = queueRef.current.shift()!
      syncQueueCount()
      await sendOne(next)
    }
  }, [sendOne, syncQueueCount])

  drainQueueRef.current = drainQueue

  const send = useCallback(
    async (content: string, todoOptions?: SendMessageOptions) => {
      if (!sessionRef.current) throw new Error('Session not started')
      if (busyRef.current) {
        queueRef.current.push(content)
        syncQueueCount()
        return { queued: true as const }
      }
      await sendOne(content, todoOptions)
      await drainQueue()
      return { queued: false as const }
    },
    [sendOne, drainQueue, syncQueueCount]
  )

  const undo = useCallback(async () => {
    if (!sessionRef.current) throw new Error('Session not started')
    await sessionRef.current.undo()
  }, [])

  const cancelSend = useCallback(() => {
    sessionRef.current?.cancelSend()
    busyRef.current = false
    setIsBusy(false)
    process.idle()
  }, [process])

  const submitConfirm = useCallback(async (confirmId: string, answer: boolean) => {
    if (!sessionRef.current) throw new Error('Session not started')
    await sessionRef.current.submitConfirm(confirmId, answer)
  }, [])

  const addFiles = useCallback(async (paths: string[]) => {
    if (!sessionRef.current) throw new Error('Session not started')
    const { info } = await sessionRef.current.addFiles(paths)
    setSessionInfo(info)
    return info
  }, [])

  const uploadFiles = useCallback(
    async (files: { filename: string; content_base64: string }[]) => {
      if (!sessionRef.current) throw new Error('Session not started')
      const { info } = await sessionRef.current.uploadFiles(files)
      setSessionInfo(info)
      return info
    },
    []
  )

  const refreshSessionInfo = useCallback(async (): Promise<CoreSessionInfo | null> => {
    const client = sessionRef.current?.getHttpClient()
    const sid = sessionRef.current?.getSessionId()
    if (!client || !sid) return null
    const info = await client.getSession(sid)
    setSessionInfo(info)
    return info
  }, [])

  return {
    isRunning,
    isStarting,
    isBusy,
    queuedCount,
    clearQueue,
    sessionInfo,
    apiUrl,
    httpClient,
    start,
    stop,
    send,
    addFiles,
    uploadFiles,
    refreshSessionInfo,
    cancelSend,
    submitConfirm,
    undo,
    defaultConfig: DEFAULT_CONFIG,
  }
}
