import { describe, expect, it } from 'vitest'
import { withMarkdownHardBreaks } from './markdownNewlines'

describe('withMarkdownHardBreaks', () => {
  it('preserves single newlines outside fences', () => {
    const input = 'line one\nline two\n\nparagraph two'
    const out = withMarkdownHardBreaks(input)
    expect(out).toContain('line one  \nline two')
    expect(out).toContain('\n\nparagraph two')
  })

  it('does not alter fenced blocks', () => {
    const input = 'before\n```json\n{"a":1}\n```\nafter'
    const out = withMarkdownHardBreaks(input)
    expect(out).toContain('```json\n{"a":1}\n```')
    expect(out.startsWith('before  \n')).toBe(true)
    expect(out.endsWith('after')).toBe(true)
  })
})
