import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_CONFIG, type VisionConfig } from '../ipc/config'
import type {
  CoreHttpClient,
  CoreSessionInfo,
  ModelRouterApiConfig,
  SendMessageOptions,
  SessionTranscriptRow,
} from '../ipc/httpClient'
import type { CoreEventBase } from '../ipc/events'
import { isTauriRuntime } from '../ipc/isTauri'
import { SseIdleTimeoutError } from '../ipc/sseIdle'
import { createVisionApiSession, type VisionApiSession } from '../ipc/visionApi'
import { isUserCancellationError } from '../utils/abort'
import { parseAddCommandPath } from '../utils/suggestedFiles'
import { useProcess } from '../progress/processStore'

export interface UseVisionSessionOptions {
  /** Called when a user message is actually sent to core (not when queued). */
  onOutboundMessage?: (content: string) => void
}

export function useVisionSession(
  onCoreEvent: (event: CoreEventBase) => void,
  options: UseVisionSessionOptions = {}
) {
  const onOutboundMessageRef = useRef(options.onOutboundMessage)
  onOutboundMessageRef.current = options.onOutboundMessage
  const process = useProcess()
  const [isRunning, setIsRunning] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [queuedCount, setQueuedCount] = useState(0)
  const [queuedMessages, setQueuedMessages] = useState<string[]>([])
  const [sessionInfo, setSessionInfo] = useState<CoreSessionInfo | null>(null)
  const [apiUrl, setApiUrl] = useState<string | null>(null)
  const [httpClient, setHttpClient] = useState<CoreHttpClient | null>(null)
  const sessionRef = useRef<VisionApiSession | null>(null)
  const pendingStartRef = useRef<VisionApiSession | null>(null)
  const inflightRef = useRef(0)
  const sendGenerationRef = useRef(0)
  const queueRef = useRef<{ content: string; options?: SendMessageOptions }[]>([])
  const drainQueueRef = useRef<() => Promise<void>>(async () => {})

  const setBusyFromInflight = useCallback(() => {
    setIsBusy(inflightRef.current > 0)
  }, [])

  const syncQueueState = useCallback(() => {
    setQueuedCount(queueRef.current.length)
    setQueuedMessages(queueRef.current.map((item) => item.content))
  }, [])

  const clearQueue = useCallback(() => {
    queueRef.current = []
    syncQueueState()
  }, [syncQueueState])

  const removeQueuedAt = useCallback(
    (index: number) => {
      if (index < 0 || index >= queueRef.current.length) return
      queueRef.current.splice(index, 1)
      syncQueueState()
    },
    [syncQueueState]
  )

  const startGenerationRef = useRef(0)

  const start = useCallback(
    async (
      config: VisionConfig,
      startOptions?: { modelRouter?: ModelRouterApiConfig }
    ) => {
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
        const info = await session.start(resolved, startOptions)
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
        let transcript: SessionTranscriptRow[] = []
        const client = session.getHttpClient()
        if (config.autoLoadSession && client) {
          try {
            transcript = await client.getSessionTranscript(info.session_id)
          } catch {
            transcript = []
          }
        }
        return { info, workingDir: resolved.workingDir, transcript }
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
      sendGenerationRef.current += 1
      inflightRef.current = 0
      setIsBusy(false)
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

  const finishSendGeneration = useCallback(
    (generation: number) => {
      if (generation !== sendGenerationRef.current) return
      inflightRef.current = Math.max(0, inflightRef.current - 1)
      setBusyFromInflight()
      void drainQueueRef.current()
    },
    [setBusyFromInflight]
  )

  /** Core emitted ``done``/``error`` — unblock UI before HTTP teardown finishes. */
  const releaseInflightAfterTurn = useCallback(() => {
    if (inflightRef.current <= 0) return
    inflightRef.current = 0
    setIsBusy(false)
    void drainQueueRef.current()
  }, [])

  const sendOne = useCallback(
    async (content: string, todoOptions?: SendMessageOptions) => {
      if (!sessionRef.current) throw new Error('Session not started')
      const addPath = parseAddCommandPath(content)
      if (addPath) {
        const generation = ++sendGenerationRef.current
        inflightRef.current += 1
        setBusyFromInflight()
        process.begin('tool', 'Adding files')
        try {
          const { info } = await sessionRef.current.addFiles([addPath])
          setSessionInfo(info)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          process.fail(message)
          throw err
        } finally {
          finishSendGeneration(generation)
          if (inflightRef.current === 0) process.idle()
        }
        return
      }
      onOutboundMessageRef.current?.(content)
      const generation = ++sendGenerationRef.current
      inflightRef.current += 1
      setBusyFromInflight()
      process.begin('reasoning', 'Sending')
      try {
        await sessionRef.current.send(content, todoOptions)
      } catch (err) {
        if (isUserCancellationError(err)) {
          process.idle()
          return
        }
        const message =
          err instanceof SseIdleTimeoutError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err)
        process.fail(message)
        throw err
      } finally {
        finishSendGeneration(generation)
        if (inflightRef.current === 0) process.idle()
      }
    },
    [process, setBusyFromInflight, finishSendGeneration]
  )

  const drainQueue = useCallback(async () => {
    while (queueRef.current.length > 0 && sessionRef.current && inflightRef.current === 0) {
      const next = queueRef.current.shift()!
      syncQueueState()
      await sendOne(next.content, next.options)
    }
  }, [sendOne, syncQueueState])

  drainQueueRef.current = drainQueue

  const send = useCallback(
    async (content: string, todoOptions?: SendMessageOptions) => {
      if (!sessionRef.current) throw new Error('Session not started')
      if (parseAddCommandPath(content)) {
        await sendOne(content, todoOptions)
        return { queued: false as const }
      }
      if (inflightRef.current > 0) {
        queueRef.current.push({ content, options: todoOptions })
        onOutboundMessageRef.current?.(content)
        syncQueueState()
        return { queued: true as const }
      }
      await sendOne(content, todoOptions)
      await drainQueue()
      return { queued: false as const }
    },
    [sendOne, drainQueue, syncQueueState]
  )

  const undo = useCallback(async () => {
    if (!sessionRef.current) throw new Error('Session not started')
    await sessionRef.current.undo()
  }, [])

  const cancelSend = useCallback(() => {
    sendGenerationRef.current += 1
    sessionRef.current?.cancelSend()
    inflightRef.current = 0
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

  const patchSessionFiles = useCallback((files: string[]) => {
    setSessionInfo((prev) => (prev ? { ...prev, files_in_chat: files } : prev))
  }, [])

  return {
    isRunning,
    isStarting,
    isBusy,
    queuedCount,
    queuedMessages,
    clearQueue,
    removeQueuedAt,
    sessionInfo,
    apiUrl,
    httpClient,
    start,
    stop,
    send,
    addFiles,
    uploadFiles,
    refreshSessionInfo,
    patchSessionFiles,
    cancelSend,
    releaseInflightAfterTurn,
    submitConfirm,
    undo,
    defaultConfig: DEFAULT_CONFIG,
  }
}
