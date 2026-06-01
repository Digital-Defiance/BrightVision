import { isSearchReplaceBlock } from './proposedEdits'

function normalizeChunk(s: string, maxLen = 400): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

/**
 * Skip tool_output that repeats SEARCH/REPLACE already shown in the assistant stream.
 * Cecli often echoes failed or duplicate edit blocks to tool_output while the answer
 * already contains the same proposal.
 */
export function isRedundantEditToolOutput(
  toolOutput: string,
  assistantContent: string
): boolean {
  const out = toolOutput.trim()
  if (!out || !isSearchReplaceBlock(out)) return false
  const assistant = assistantContent.trim()
  if (!assistant || !isSearchReplaceBlock(assistant)) return false

  const a = normalizeChunk(assistant)
  const t = normalizeChunk(out)
  if (t.length < 40) return false
  if (a.includes(t) || t.includes(a)) return true

  const searchSnippet = out.match(/<<<<<<< SEARCH\n([\s\S]{0,200})/)?.[1]
  if (searchSnippet && assistant.includes(searchSnippet.trim().slice(0, 80))) {
    return true
  }
  return false
}
