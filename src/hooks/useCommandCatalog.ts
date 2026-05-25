import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_COMMANDS,
  fetchSessionCommands,
  mergeCommandCatalog,
  type VisionCommand,
} from '../ipc/commands'
import type { CoreHttpClient } from '../ipc/httpClient'

export function useCommandCatalog(
  client: CoreHttpClient | null,
  sessionId: string | null
) {
  const [commands, setCommands] = useState<VisionCommand[]>(
    mergeCommandCatalog(DEFAULT_COMMANDS)
  )

  const reload = useCallback(async () => {
    if (!client || !sessionId) {
      setCommands(mergeCommandCatalog(DEFAULT_COMMANDS))
      return
    }
    try {
      const list = await fetchSessionCommands(client, sessionId)
      setCommands(list)
    } catch {
      setCommands(mergeCommandCatalog(DEFAULT_COMMANDS))
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
