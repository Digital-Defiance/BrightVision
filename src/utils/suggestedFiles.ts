/**
 * Extract workspace-relative file paths from assistant prose (e.g. "add these files"
 * bullet lists) and build `/add` lines for the session message queue.
 *
 * @see docs/ROADMAP.md #32
 */

const FILE_EXT =
  'py|ts|tsx|js|jsx|rs|md|json|yaml|yml|toml|sh|html|css|scss|vue|go|java|kt|swift|rb|php|cs|cpp|h|hpp|txt|xml|sql|graphql|proto|ipynb'

const BULLET_PATH_LINE = new RegExp(
  `^\\s*[-*]\\s+(?:\`([^\`]+)\`|(\\S+\\.(?:${FILE_EXT})))\\b`,
  'im'
)

const NUMBERED_PATH_LINE = new RegExp(
  `^\\s*\\d+\\.\\s+(?:\`([^\`]+)\`|(\\S+\\.(?:${FILE_EXT})))\\b`,
  'im'
)

const BACKTICK_PATH = new RegExp(`\`([^\\n\`]+\\.(?:${FILE_EXT}))\``, 'gi')

function normalizeSuggestedPath(raw: string): string | null {
  let p = raw.trim().replace(/^`+|`+$/g, '').replace(/^\.\//, '')
  if (!p || p.includes('://') || p.startsWith('http')) return null
  if (!p.includes('/') || /\s/.test(p)) return null
  if (p.length < 4) return null
  return p
}

function addPath(set: Set<string>, raw: string | undefined) {
  if (!raw) return
  const n = normalizeSuggestedPath(raw)
  if (n) set.add(n)
}

function collectPathsFromLines(block: string, found: Set<string>) {
  for (const line of block.split('\n')) {
    const bullet = line.match(BULLET_PATH_LINE)
    if (bullet) {
      addPath(found, bullet[1] ?? bullet[2])
      continue
    }
    const numbered = line.match(NUMBERED_PATH_LINE)
    if (numbered) {
      addPath(found, numbered[1] ?? numbered[2])
    }
  }
}

function collectBacktickPaths(block: string, found: Set<string>) {
  for (const m of block.matchAll(BACKTICK_PATH)) {
    addPath(found, m[1])
  }
}

/** Pull likely repo-relative paths from assistant Answer text or full message. */
export function extractSuggestedFilePaths(text: string): string[] {
  const found = new Set<string>()
  const answerBlock = extractAnswerSection(text) ?? text

  collectPathsFromLines(answerBlock, found)
  collectBacktickPaths(answerBlock, found)

  return [...found].sort()
}

/** Paths requested via /add or tray that are still not in session context. */
export function pathsNotInChat(requested: string[], filesInChat: string[]): string[] {
  const inChat = new Set(filesInChat.map((f) => f.trim()))
  return requested.map((p) => p.trim()).filter((p) => p && !inChat.has(p))
}

/**
 * True when the assistant is mainly waiting for the user to add listed files
 * (safe to offer or run "add all & proceed").
 */
export function isAwaitingFilesCta(text: string): boolean {
  // CTA often appears after the path list; do not use extractAnswerSection (it strips the CTA).
  const block = text.toLowerCase()
  return (
    /\bplease add (?:these )?(?:\d+ |three |two )?files?\b/.test(block) ||
    /\badd (?:these )?(?:\d+ )?files? to the chat\b/.test(block) ||
    /\bcould you please add\b/.test(block) ||
    /\blet me know when (?:you've |you have )?added\b/.test(block)
  )
}

/** Prefer content after an Answer marker when present. */
export function extractAnswerSection(text: string): string | null {
  const markers = [
    /►\s*\*\*ANSWER\*\*/i,
    /\*\*ANSWER\*\*/i,
    /^Answer\s*$/im,
  ]
  let start = -1
  let markerLen = 0
  for (const re of markers) {
    const hit = text.match(re)
    if (hit?.index !== undefined && (start < 0 || hit.index < start)) {
      start = hit.index
      markerLen = hit[0].length
    }
  }
  if (start < 0) return null
  let tail = text.slice(start + markerLen)
  const nextSection = tail.search(/\n\s*►\s*\*\*(?:THINKING|REASONING)\*\*/i)
  if (nextSection >= 0) tail = tail.slice(0, nextSection)
  const cta = tail.search(/\n\s*Please add these files\b/i)
  if (cta >= 0) tail = tail.slice(0, cta)
  return tail
}

/** One queued user message per file — uses existing `useVisionSession` send queue (#4). */
export function buildQueuedAddMessages(paths: string[]): string[] {
  return paths.map((p) => `/add ${p.trim()}`)
}

/** Single `/add <path>` user message (no extra args). */
export function parseAddCommandPath(text: string): string | null {
  const m = text.trim().match(/^\/add\s+(\S+)\s*$/i)
  if (!m?.[1]) return null
  return normalizeSuggestedPath(m[1])
}

export function filterPathsNotInChat(paths: string[], filesInChat: string[]): string[] {
  const inChat = new Set(filesInChat.map((f) => f.trim()))
  return paths.filter((p) => !inChat.has(p))
}

export interface SuggestedFileEntry {
  path: string
  addCommand: string
}

export function buildSuggestedFileEntries(
  text: string,
  filesInChat: string[] = []
): SuggestedFileEntry[] {
  const paths = filterPathsNotInChat(extractSuggestedFilePaths(text), filesInChat)
  return paths.map((path) => ({ path, addCommand: `/add ${path}` }))
}

/** Session tray: merge new paths from assistant text, dedupe, drop paths already in chat. */
export function mergeSuggestedPaths(
  existing: string[],
  assistantText: string,
  filesInChat: string[] = []
): string[] {
  const incoming = filterPathsNotInChat(extractSuggestedFilePaths(assistantText), filesInChat)
  const set = new Set(existing)
  for (const p of incoming) set.add(p)
  return filterPathsNotInChat([...set], filesInChat).sort()
}
