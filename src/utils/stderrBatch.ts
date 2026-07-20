/** Coalesce rapid stderr lines (e.g. uvicorn tracebacks) into one chat block. */

export function shouldSkipStderrLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (trimmed.includes('\r')) return true
  if (/Scanning repo:\s*\d+%/.test(trimmed)) return true
  if (/\d+it\/s\]/.test(trimmed)) return true
  // LiteLLM/huggingface_hub Hub rate-limit nudge (no prompt data; filtered when disabled in core)
  if (/unauthenticated requests to the HF Hub/i.test(trimmed)) return true
  if (/Please set a HF_TOKEN/i.test(trimmed)) return true
  return false
}

export type StderrBatchFlush = (text: string) => void

export class StderrBatcher {
  private lines: string[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly flush: StderrBatchFlush,
    private readonly delayMs = 120
  ) {}

  push(line: string) {
    if (shouldSkipStderrLine(line)) return
    this.lines.push(line)
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flushNow(), this.delayMs)
  }

  flushNow() {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.lines.length === 0) return
    const text = this.lines.join('\n')
    this.lines = []
    this.flush(text)
  }
}
