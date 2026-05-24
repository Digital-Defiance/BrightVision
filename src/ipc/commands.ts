import type { CoreHttpClient } from './httpClient'

export interface VisionCommand {
  name: string
  summary: string
}

/** Fallback when session API is unavailable (web / pre-start). */
export const DEFAULT_COMMANDS: VisionCommand[] = [
  { name: '/help', summary: 'Show help about commands' },
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
export const QUICK_COMMANDS = ['/help', '/add', '/drop', '/diff', '/commit', '/undo', '/ls']

export async function fetchSessionCommands(
  client: CoreHttpClient,
  sessionId: string
): Promise<VisionCommand[]> {
  return client.listCommands(sessionId)
}
