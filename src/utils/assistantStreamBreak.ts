const UNDO_HINT_RE = /^You can use \/undo to undo and discard each cecli commit\.\s*$/i
const AUTO_CONTINUE_STATUS_RE =
  /^EditText failed — auto-continuing once with ReadRange guidance…\s*$/i
const TOKEN_USAGE_RE = /^\d+k?\s*[↑↓↧]\s*\d+k?\s*[↑↓↧]/i

/** True while the model is mid-stream inside `<tool_call>…</tool_call>`. */
export function isInsideIncompleteToolCall(content: string): boolean {
  const open = (content.match(/<tool_call>/gi) ?? []).length
  const close = (content.match(/<\/tool_call>/gi) ?? []).length
  return open > close
}

/** Tool output that should not split the assistant bubble mid-stream. */
export function isNonBreakingToolOutput(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (UNDO_HINT_RE.test(t)) return true
  if (AUTO_CONTINUE_STATUS_RE.test(t)) return true
  if (TOKEN_USAGE_RE.test(t)) return true
  if (/^session loaded\b/i.test(t)) return true
  return false
}

/**
 * Whether a tool event should end the current assistant streaming bubble.
 * Keeps XML tool calls intact when cecli emits status lines (e.g. /undo hint) mid-token.
 */
export function shouldBreakAssistantStreamForToolEvent(
  text: string,
  assistantStreamContent: string
): boolean {
  if (isNonBreakingToolOutput(text)) return false
  if (isInsideIncompleteToolCall(assistantStreamContent)) return false
  return true
}
