/** Single-line preview for header chip and list rows. */
export function formatQueuePreview(text: string, maxLen = 56): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (!one) return '(empty message)'
  if (one.length <= maxLen) return one
  return `${one.slice(0, maxLen - 1)}…`
}

export function formatQueueChipLabel(count: number): string {
  return `${count} queued`
}
