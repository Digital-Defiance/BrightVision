/** Slash commands handled in the shell (not sent to the Vision API / Cecli turn). */

export type VisionClientCommandId = 'ps' | 'tags' | 'models' | 'turns' | 'pause' | 'resume'

export interface VisionClientCommand {
  name: string
  summary: string
  id: VisionClientCommandId
}

export const VISION_CLIENT_COMMANDS: VisionClientCommand[] = [
  { name: '/ps', summary: 'Loaded models in RAM (Ollama /api/ps or lms ps --json)', id: 'ps' },
  { name: '/tags', summary: 'Models on disk (Ollama /api/tags or lms ls --json)', id: 'tags' },
  {
    name: '/models',
    summary: 'On-disk + loaded model tables (tags + ps)',
    id: 'models',
  },
  {
    name: '/turns',
    summary: 'Recent turn timings table (response, think, memory pressure)',
    id: 'turns',
  },
  {
    name: '/pause',
    summary: 'Pause agent after the current step (blocks new sends until /resume)',
    id: 'pause',
  },
  {
    name: '/resume',
    summary: 'Resume agent after /pause',
    id: 'resume',
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
