import { useCallback, useRef, useState } from 'react'
import {
  CoreHttpClient,
  type CoreEventBase,
  type CoreSessionInfo,
} from '@brightvision/vision-client'

export interface RemoteChatLine {
  id: number
  role: 'user' | 'assistant' | 'system'
  text: string
}

export function useRemoteSession(client: CoreHttpClient) {
  const [session, setSession] = useState<CoreSessionInfo | null>(null)
  const [lines, setLines] = useState<RemoteChatLine[]>([])
  const [status, setStatus] = useState('Disconnected')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const seqRef = useRef(0)

  const append = useCallback((role: RemoteChatLine['role'], text: string) => {
    const t = text.trim()
    if (!t) return
    setLines((prev) => [...prev, { id: ++seqRef.current, role, text: t }])
  }, [])

  const startSession = useCallback(
    async (workspace: string, model: string) => {
      setBusy(true)
      setStatus('Starting session…')
      try {
        const info = await client.createSession({
          workspace: workspace.trim(),
          model: model.trim() || 'ollama_chat/llama3.2',
          stream: true,
        })
        setSession(info)
        setLines([])
        setStatus('Ready')
        return info
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e))
        throw e
      } finally {
        setBusy(false)
      }
    },
    [client]
  )

  const handleEvent = useCallback((ev: CoreEventBase) => {
    switch (ev.type) {
      case 'token':
        setLines((prev) => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + String(ev.text ?? '') },
            ]
          }
          return [...prev, { id: ++seqRef.current, role: 'assistant', text: String(ev.text ?? '') }]
        })
        break
      case 'progress':
        setStatus(String((ev as { message?: string }).message ?? (ev as { label?: string }).label ?? 'Working…'))
        break
      case 'tool_output':
        append('system', `Tool: ${String(ev.text ?? '').slice(0, 500)}`)
        break
      case 'error':
        append('system', String(ev.text ?? 'Error'))
        setStatus('Error')
        break
      case 'done':
        setStatus('Ready')
        break
      default:
        break
    }
  }, [append])

  const sendUserMessage = useCallback(
    async (content: string) => {
      if (!session) throw new Error('No session')
      const text = content.trim()
      if (!text) return
      append('user', text)
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      setBusy(true)
      setStatus('Sending…')
      try {
        for await (const ev of client.sendMessage(
          session.session_id,
          text,
          abortRef.current.signal
        )) {
          handleEvent(ev)
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          setStatus('Stopped')
          return
        }
        append('system', e instanceof Error ? e.message : String(e))
        setStatus('Error')
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [session, client, append, handleEvent]
  )

  const stopTurn = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = null
    if (!session) return
    try {
      await client.interruptTurn(session.session_id)
    } catch {
      /* best-effort */
    }
    setStatus('Stopped')
    setBusy(false)
  }, [session, client])

  const endSession = useCallback(async () => {
    await stopTurn()
    if (session) {
      try {
        await client.deleteSession(session.session_id)
      } catch {
        /* best-effort */
      }
    }
    setSession(null)
    setStatus('Disconnected')
  }, [session, client, stopTurn])

  return {
    session,
    lines,
    status,
    busy,
    startSession,
    sendUserMessage,
    stopTurn,
    endSession,
  }
}
