import { formatDurationMs } from './thinkingTiming'

/** Core SSE progress pulses append ``(123s)`` — reformat for display. */
const PROGRESS_ELAPSED_SUFFIX_RE = /\s*\((\d+)s\)\s*$/

export function formatProgressElapsedSuffix(
  text: string,
  opts?: { brightDate?: boolean }
): string {
  const m = text.match(PROGRESS_ELAPSED_SUFFIX_RE)
  if (!m) return text
  const sec = Number(m[1])
  if (!Number.isFinite(sec) || sec < 0) return text
  const formatted = formatDurationMs(sec * 1000, { brightDate: opts?.brightDate })
  return text.replace(PROGRESS_ELAPSED_SUFFIX_RE, ` (${formatted})`)
}

export type ActivityBrand = 'AGENT' | 'VISION'

export interface ActivityPresentation {
  brand: ActivityBrand
  /** Primary activity bar label (uppercased in CSS). */
  headline: string
  /** Optional secondary line under the headline. */
  detail?: string
}

function stripElapsedSuffix(message: string): string {
  return message.replace(PROGRESS_ELAPSED_SUFFIX_RE, '').trim()
}

function inferFromProgressMessage(message: string, isAgent: boolean): ActivityPresentation | null {
  const base = stripElapsedSuffix(message)
  const lower = base.toLowerCase()
  if (/running slash commands/.test(lower)) {
    return {
      brand: isAgent ? 'AGENT' : 'VISION',
      headline: isAgent ? 'Running agent commands' : 'Running slash commands',
      detail: base,
    }
  }
  if (/preparing workspace/.test(lower)) {
    return {
      brand: isAgent ? 'AGENT' : 'VISION',
      headline: 'Preparing workspace',
      detail: base,
    }
  }
  if (/waiting for/.test(lower)) {
    return {
      brand: isAgent ? 'AGENT' : 'VISION',
      headline: 'Waiting for model',
      detail: base,
    }
  }
  return null
}

function inferFromToolOutput(text: string): ActivityPresentation | null {
  const t = text.trim()
  const lower = t.toLowerCase()
  if (/^tool call:/i.test(t)) {
    const cmd = t.replace(/^tool call:\s*/i, '').trim()
    return {
      brand: 'AGENT',
      headline: cmd ? `Tool: ${cmd.slice(0, 80)}` : 'Running tool',
      detail: cmd.length > 80 ? cmd : undefined,
    }
  }
  if (/executing shell command/i.test(lower)) {
    return { brand: 'AGENT', headline: 'Executing shell command', detail: t.slice(0, 120) }
  }
  if (/^command:/i.test(t)) {
    return { brand: 'AGENT', headline: 'Running shell command', detail: t.slice(0, 120) }
  }
  if (/^listed \d+ file/i.test(lower) || /^tool:\s*output/i.test(lower)) {
    return { brand: 'AGENT', headline: 'Examining command response', detail: t.slice(0, 120) }
  }
  if (/^scanning repo|^updating repo map/i.test(lower)) {
    return { brand: 'AGENT', headline: 'Scanning repository', detail: t.slice(0, 120) }
  }
  if (/exploring|let me start/i.test(lower) && t.length < 200) {
    return { brand: 'AGENT', headline: 'Exploring project', detail: t.slice(0, 120) }
  }
  return null
}

/** Map core progress / recent tool text to AGENT vs VISION activity bar copy. */
export function buildActivityPresentation(input: {
  processLabel: string
  processDetail?: string
  isAgentTurn: boolean
  lastToolSnippet?: string
  brightDate?: boolean
}): ActivityPresentation {
  const detailRaw = input.processDetail?.trim() ?? ''
  const detailFmt = detailRaw
    ? formatProgressElapsedSuffix(detailRaw, { brightDate: input.brightDate })
    : undefined

  const fromTool =
    input.isAgentTurn && input.lastToolSnippet
      ? inferFromToolOutput(input.lastToolSnippet)
      : null
  if (fromTool && input.processLabel.toLowerCase() !== 'answering') {
    return {
      ...fromTool,
      detail: detailFmt && detailFmt !== fromTool.headline ? detailFmt : fromTool.detail,
    }
  }

  if (detailFmt) {
    const fromProgress = inferFromProgressMessage(detailFmt, input.isAgentTurn)
    if (fromProgress) {
      return {
        brand: fromProgress.brand,
        headline: fromProgress.headline,
        detail:
          fromProgress.detail && fromProgress.detail !== fromProgress.headline
            ? fromProgress.detail
            : undefined,
      }
    }
  }

  const label = input.processLabel.trim() || 'Working'
  return {
    brand: input.isAgentTurn ? 'AGENT' : 'VISION',
    headline: label,
    detail: detailFmt && detailFmt !== label ? detailFmt : undefined,
  }
}
