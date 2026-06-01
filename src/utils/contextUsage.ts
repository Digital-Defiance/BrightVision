/**
 * Session context / token usage surfaced in the header and after /add.
 * Token lines come from core `tool_output` (Cecli usage report).
 */

export interface TokenUsageReport {
  tokensSent: number
  tokensReceived: number
  raw: string
}

export interface SessionContextUsage {
  /** Latest turn usage from `Tokens:` tool_output. */
  lastReport: TokenUsageReport | null
  /** Rough token estimate from file bytes added this session (chars / 4). */
  estimatedFromAdds: number
}

export const EMPTY_CONTEXT_USAGE: SessionContextUsage = {
  lastReport: null,
  estimatedFromAdds: 0,
}

function parseTokenCount(token: string): number | null {
  const t = token.trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '')
  const m = t.match(/^([\d.]+)\s*(k|m)?$/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n)) return null
  const suffix = m[2]
  if (suffix === 'k') return Math.round(n * 1000)
  if (suffix === 'm') return Math.round(n * 1_000_000)
  return Math.round(n)
}

/**
 * Parse token usage from core `tool_output`.
 * - Legacy format: `Tokens: 1.2k sent, 450 received`
 * - cecli: `1.2k ↑ 450 ↓` (optional cache segments before ↑, cost/speed lines after)
 */
export function parseTokenUsageReport(text: string): TokenUsageReport | null {
  const t = text.trim()
  if (!t) return null
  const clean = t.replace(/\x1b\[[0-9;]*m/g, '')

  const legacy = clean.match(/\bTokens:\s*(.+?)\s*sent,\s*(.+?)\s*received/i)
  if (legacy) {
    const tokensSent = parseTokenCount(legacy[1])
    const tokensReceived = parseTokenCount(legacy[2])
    if (tokensSent !== null && tokensReceived !== null) {
      return { tokensSent, tokensReceived, raw: t }
    }
  }

  // cecli usage line, tolerant to minor formatting variants:
  // - `1.2k ↑ 450 ↓`
  // - `1.2k/500 ↑ 450 ↓ $0.00 • 2.1k ↑↓ $0.00`
  // - `1.2k tokens ⇡ 450 tokens ⇣`
  const cecli = clean.match(
    /(\d+(?:\.\d+)?\s*[km]?(?:\s*\/\s*\d+(?:\.\d+)?\s*[km]?)*)\s*(?:tokens?|tok)?\s*[↑⇡]\s*(\d+(?:\.\d+)?\s*[km]?)\s*(?:tokens?|tok)?\s*[↓⇣]/i
  )
  if (cecli) {
    const sentPart = cecli[1].split('/')[0]?.trim() ?? ''
    const tokensSent = parseTokenCount(sentPart)
    const tokensReceived = parseTokenCount(cecli[2])
    if (tokensSent !== null && tokensReceived !== null) {
      return { tokensSent, tokensReceived, raw: t }
    }
  }

  return null
}

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

/** Chars → ~tokens (standard rough estimate for code text). */
export function charsToEstimatedTokens(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0
  return Math.ceil(chars / 4)
}

export function formatSessionContextChip(
  fileCount: number,
  usage: SessionContextUsage
): string {
  const parts: string[] = []
  parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`)
  if (usage.lastReport) {
    parts.push(`${formatTokenCount(usage.lastReport.tokensSent)} sent`)
  } else if (usage.estimatedFromAdds > 0) {
    parts.push(`~${formatTokenCount(usage.estimatedFromAdds)} added`)
  }
  return parts.join(' · ')
}

export function sessionContextTooltip(
  files: string[],
  usage: SessionContextUsage
): string {
  const lines: string[] = []
  if (files.length) {
    lines.push('In chat:')
    lines.push(...files.slice(0, 40))
    if (files.length > 40) lines.push(`… +${files.length - 40} more`)
  } else {
    lines.push('In chat: (repo map only)')
  }
  if (usage.estimatedFromAdds > 0) {
    lines.push('')
    lines.push(`Estimated from /add this session: ~${formatTokenCount(usage.estimatedFromAdds)} tokens`)
  }
  if (usage.lastReport) {
    lines.push('')
    lines.push(usage.lastReport.raw)
  }
  return lines.join('\n')
}
