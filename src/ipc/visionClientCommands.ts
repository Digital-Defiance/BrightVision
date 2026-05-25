/** Slash commands handled in the shell (not sent to Vision core). */

export type VisionClientCommandId = 'ps' | 'tags' | 'models'

export interface VisionClientCommand {
  name: string
  summary: string
  id: VisionClientCommandId
}

export const VISION_CLIENT_COMMANDS: VisionClientCommand[] = [
  { name: '/ps', summary: 'Ollama /api/ps — models loaded in RAM (table)', id: 'ps' },
  { name: '/tags', summary: 'Ollama /api/tags — pulled models (table)', id: 'tags' },
  {
    name: '/models',
    summary: 'Ollama /api/tags + /api/ps (both tables)',
    id: 'models',
  },
]

const CLIENT_BY_NAME = new Map(
  VISION_CLIENT_COMMANDS.map((c) => [c.name.toLowerCase(), c] as const)
)

/** Exact match on first token (e.g. `/ps`, `/tags`). */
export function parseVisionClientCommand(text: string): VisionClientCommand | null {
  const token = text.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return CLIENT_BY_NAME.get(token) ?? null
}

export function mergeCommandCatalog(
  coreCommands: { name: string; summary: string }[]
): { name: string; summary: string }[] {
  const seen = new Set<string>()
  const out: { name: string; summary: string }[] = []
  for (const c of [...VISION_CLIENT_COMMANDS, ...coreCommands]) {
    const key = c.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name: c.name, summary: c.summary })
  }
  return out
}
