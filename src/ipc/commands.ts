import type { CoreHttpClient } from './httpClient'
import { mergeAgentCommandFallbacks } from './agentCommands'
import { mergeCommandCatalog } from './visionClientCommands'

export interface VisionCommand {
  name: string
  summary: string
}

/** Fallback when session API is unavailable (web / pre-start). */
export const DEFAULT_COMMANDS: VisionCommand[] = [
  { name: '/help', summary: 'Show help about commands' },
  { name: '/hot-reload', summary: 'Re-read cecli config and refresh MCP/skills (keeps chat)' },
  { name: '/add', summary: 'Add files to the chat' },
  { name: '/drop', summary: 'Remove files from the chat' },
  { name: '/diff', summary: 'Display the diff of changes' },
  { name: '/commit', summary: 'Commit edits outside the chat' },
  { name: '/undo', summary: 'Undo the last commit' },
  { name: '/ls', summary: 'List files in the repo' },
  { name: '/model', summary: 'Switch the main model' },
  { name: '/tokens', summary: 'Report token usage' },
  { name: '/run', summary: 'Run a shell command (use !cmd in chat)' },
]

/** One-click shortcuts above the chat input (full list still appears when you type `/`). */
export const QUICK_COMMANDS = [
  '/help',
  '/hot-reload',
  '/ps',
  '/add',
  '/drop',
  '/diff',
  '/commit',
  '/undo',
  '/ls',
]

/** Optional tooltips for quick-command chips (CommandAssist). */
export const QUICK_COMMAND_HINTS: Partial<Record<string, string>> = {
  '/hot-reload':
    'Re-read .cecli.conf.yml, refresh MCP/skills, and reload agent config without clearing chat',
  '/ps': 'Models loaded in RAM (Ollama / LM Studio)',
}

export async function fetchSessionCommands(
  client: CoreHttpClient,
  sessionId: string
): Promise<VisionCommand[]> {
  const core = await client.listCommands(sessionId)
  const merged = mergeCommandCatalog(core.length > 0 ? core : DEFAULT_COMMANDS)
  return mergeAgentCommandFallbacks(merged)
}

/** Default slash list for pre-session UI and when command fetch fails. */
export function buildDefaultCommandCatalog(): VisionCommand[] {
  return mergeAgentCommandFallbacks(mergeCommandCatalog(DEFAULT_COMMANDS))
}

export { mergeCommandCatalog, VISION_CLIENT_COMMANDS } from './visionClientCommands'
