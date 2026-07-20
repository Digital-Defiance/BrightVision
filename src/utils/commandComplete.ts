import type { VisionCommand } from '../ipc/commands'

/** Slash commands matching the first token (e.g. `/ag` → `/agent`, `/agent-model`). */
export function filterSlashCommandSuggestions(
  commands: VisionCommand[],
  inputValue: string,
  limit = 12
): VisionCommand[] {
  const trimmed = inputValue.trim()
  if (!trimmed.startsWith('/')) return []
  const token = trimmed.split(/\s/)[0] ?? ''
  if (token === '/') return commands.slice(0, limit)
  const lower = token.toLowerCase()
  return commands.filter((c) => c.name.toLowerCase().startsWith(lower)).slice(0, limit)
}

/** Tab-complete the first token toward the next matching slash command. */
export function nextSlashCommandCompletion(
  commands: VisionCommand[],
  inputValue: string,
  cycleIndex: number
): string | null {
  const trimmed = inputValue.trimStart()
  if (!trimmed.startsWith('/')) return null
  const token = trimmed.split(/\s/)[0] ?? ''
  const rest = trimmed.slice(token.length)
  const matches = filterSlashCommandSuggestions(commands, token ? `${token}` : '/', 200)
  if (matches.length === 0) return null

  const sorted = [...matches].sort((a, b) => a.name.localeCompare(b.name))
  if (sorted.length === 1 && sorted[0].name !== token) {
    return sorted[0].name + rest
  }

  let lcp = sorted[0].name
  for (const cmd of sorted.slice(1)) {
    while (!cmd.name.toLowerCase().startsWith(lcp.toLowerCase())) {
      lcp = lcp.slice(0, -1)
    }
  }
  if (lcp.length > token.length) {
    return lcp + rest
  }

  const idx = cycleIndex % sorted.length
  const pick = sorted[idx]?.name
  if (!pick || pick === token) return null
  return pick + rest
}
