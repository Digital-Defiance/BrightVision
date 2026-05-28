import { describe, expect, it } from 'vitest'
import { parseAssistantContent } from '../../utils/proposedEdits'

/** Prose segments are rendered via ChatMarkdown (GFM); fences stay split first. */
describe('assistant markdown pipeline', () => {
  it('splits top-level fences before markdown prose', () => {
    const content = `**Open Items:**
- **#21** — EARS linter

\`\`\`python
print("hi")
\`\`\`

Done.`
    const segs = parseAssistantContent(content)
    expect(segs.filter((s) => s.type === 'prose').length).toBeGreaterThanOrEqual(1)
    expect(segs.some((s) => s.type === 'display_fence' && s.language === 'python')).toBe(true)
    const prose = segs.find((s) => s.type === 'prose')?.content ?? ''
    expect(prose).toContain('**Open Items:**')
  })
})
