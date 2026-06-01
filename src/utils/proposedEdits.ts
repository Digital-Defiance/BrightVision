/**
 * Split assistant markdown into prose vs fenced blocks that look like
 * Cecli SEARCH/REPLACE proposals (often shown but not yet applied).
 */

export type ProposedEditKind = 'search_replace' | 'fenced_file' | 'code'

export type AssistantContentSegment =
  | { type: 'prose'; content: string }
  | {
      type: 'display_fence'
      language: string
      body: string
      /** False while the closing fence is still streaming. */
      complete: boolean
    }
  | {
      type: 'proposed_edit'
      title: string
      language: string
      body: string
      kind: ProposedEditKind
    }

const SEARCH_MARK = '<<<<<<< SEARCH'
const REPLACE_MARK = '>>>>>>> REPLACE'

export function isSearchReplaceBlock(body: string): boolean {
  return body.includes(SEARCH_MARK) || body.includes(REPLACE_MARK)
}

/** Likely a repo-relative file path on its own line (editblock convention). */
export function looksLikeFilePath(line: string): boolean {
  const t = line.trim()
  if (!t || /\s/.test(t)) return false
  if (/^https?:\/\//i.test(t)) return false
  if (t.startsWith('►') || t.startsWith('#')) return false
  return (
    (t.includes('/') || t.startsWith('.')) &&
    /\.[a-zA-Z0-9]{1,12}$/.test(t.split('/').pop() ?? '')
  )
}

function classifyEdit(body: string, pathHint: string | undefined): ProposedEditKind {
  if (isSearchReplaceBlock(body)) return 'search_replace'
  if (pathHint) return 'fenced_file'
  return 'code'
}

function editTitle(pathHint: string | undefined, language: string, body: string): string {
  if (pathHint) return pathHint
  if (language && looksLikeFilePath(language)) return language
  const first = body.split('\n').find((l) => looksLikeFilePath(l))?.trim()
  if (first) return first
  return language ? `Edit (${language})` : 'Proposed edit'
}

/**
 * Parse assistant text into prose and collapsible proposed-edit fences.
 * Incomplete trailing fences (still streaming) are surfaced as proposed edits when plausible.
 */
export function parseAssistantContent(content: string): AssistantContentSegment[] {
  const segments: AssistantContentSegment[] = []
  let i = 0

  while (i < content.length) {
    const fence = content.indexOf('```', i)
    if (fence === -1) {
      const tail = content.slice(i)
      if (tail.trim()) segments.push({ type: 'prose', content: tail })
      break
    }

    let prose = content.slice(i, fence)
    let pathHint: string | undefined
    const proseLines = prose.split('\n')
    const lastLine = proseLines[proseLines.length - 1] ?? ''
    if (looksLikeFilePath(lastLine)) {
      pathHint = lastLine.trim()
      prose = proseLines.slice(0, -1).join('\n')
    }
    if (prose.trim()) {
      segments.push({ type: 'prose', content: prose })
    }

    const open = content.slice(fence).match(/^```([^\n]*)\n/)
    if (!open) {
      segments.push({ type: 'prose', content: content.slice(fence, fence + 3) })
      i = fence + 3
      continue
    }

    const language = open[1].trim()
    const bodyStart = fence + open[0].length
    let close = content.indexOf('\n```', bodyStart)
    let body: string
    let consumed: number
    if (close === -1) {
      body = content.slice(bodyStart)
      consumed = content.length - fence
    } else {
      body = content.slice(bodyStart, close)
      consumed = close + 4 - fence
    }

    const kind = classifyEdit(body, pathHint)
    const isProposed = kind === 'search_replace' || kind === 'fenced_file'

    if (isProposed) {
      segments.push({
        type: 'proposed_edit',
        title: editTitle(pathHint, language, body),
        language,
        body,
        kind,
      })
    } else {
      segments.push({
        type: 'display_fence',
        language,
        body,
        complete: close !== -1,
      })
    }

    i = fence + consumed
    if (close === -1) break
  }

  return dedupeAssistantSegments(segments)
}

/** Reduce path-only fences and raw SEARCH/REPLACE duplicated in prose. */
export function dedupeAssistantSegments(
  segments: AssistantContentSegment[]
): AssistantContentSegment[] {
  const out: AssistantContentSegment[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const next = segments[i + 1]

    if (seg.type === 'display_fence') {
      const line = seg.body.trim()
      const pathOnly =
        line &&
        looksLikeFilePath(line) &&
        !line.includes('\n') &&
        !isSearchReplaceBlock(seg.body)
      if (pathOnly && next?.type === 'proposed_edit') {
        continue
      }
    }

    if (seg.type === 'prose' && isSearchReplaceBlock(seg.content) && !seg.content.includes('```')) {
      const marker = seg.content.indexOf('<<<<<<< SEARCH')
      const body = marker >= 0 ? seg.content.slice(marker) : seg.content
      if (marker > 0) {
        const intro = seg.content.slice(0, marker).trim()
        if (intro) out.push({ type: 'prose', content: intro })
      }
      out.push({
        type: 'proposed_edit',
        title: editTitle(undefined, '', body),
        language: '',
        body,
        kind: 'search_replace',
      })
      continue
    }

    out.push(seg)
  }

  return out
}

export function normalizeRepoPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

/** Whether a proposed block likely matches a path from `done.edited_files`. */
export function isProposedEditApplied(title: string, appliedFiles: string[]): boolean {
  if (!appliedFiles.length) return false
  const norm = normalizeRepoPath(title)
  const bases = new Set(appliedFiles.map(normalizeRepoPath))
  if (bases.has(norm)) return true
  for (const f of bases) {
    if (f.endsWith('/' + norm) || norm.endsWith('/' + f) || f.endsWith(norm) || norm.endsWith(f)) {
      return true
    }
  }
  return false
}
