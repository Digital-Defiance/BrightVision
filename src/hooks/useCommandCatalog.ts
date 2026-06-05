import { useCallback, useEffect, useState } from 'react'
import {
  buildDefaultCommandCatalog,
  fetchSessionCommands,
  type VisionCommand,
} from '../ipc/commands'
import type { CoreHttpClient } from '../ipc/httpClient'
import { filterSlashCommandSuggestions } from '../utils/commandComplete'

export function useCommandCatalog(
  client: CoreHttpClient | null,
  sessionId: string | null
) {
  const [commands, setCommands] = useState<VisionCommand[]>(buildDefaultCommandCatalog())

  const reload = useCallback(async () => {
    if (!client || !sessionId) {
      setCommands(buildDefaultCommandCatalog())
      return
    }
    try {
      const list = await fetchSessionCommands(client, sessionId)
      setCommands(list)
    } catch {
      setCommands(buildDefaultCommandCatalog())
    }
  }, [client, sessionId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { commands, reload }
}

export function filterCommands(commands: VisionCommand[], input: string): VisionCommand[] {
  return filterSlashCommandSuggestions(commands, input)
}
