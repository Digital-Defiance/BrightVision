import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_COMMANDS, fetchSessionCommands, type VisionCommand } from '../ipc/commands'
import type { CoreHttpClient } from '../ipc/httpClient'

export function useCommandCatalog(
  client: CoreHttpClient | null,
  sessionId: string | null
) {
  const [commands, setCommands] = useState<VisionCommand[]>(DEFAULT_COMMANDS)

  const reload = useCallback(async () => {
    if (!client || !sessionId) {
      setCommands(DEFAULT_COMMANDS)
      return
    }
    try {
      const list = await fetchSessionCommands(client, sessionId)
      if (list.length > 0) setCommands(list)
    } catch {
      setCommands(DEFAULT_COMMANDS)
    }
  }, [client, sessionId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { commands, reload }
}

export function filterCommands(commands: VisionCommand[], input: string): VisionCommand[] {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return []
  const token = trimmed.split(/\s/)[0] ?? ''
  if (token === '/') return commands.slice(0, 12)
  const lower = token.toLowerCase()
  return commands.filter((c) => c.name.toLowerCase().startsWith(lower)).slice(0, 12)
}
