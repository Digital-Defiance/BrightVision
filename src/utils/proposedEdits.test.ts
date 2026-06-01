import { describe, expect, it } from 'vitest'
import { isSearchReplaceBlock, parseAssistantContent } from './proposedEdits'

describe('parseAssistantContent', () => {
  it('renders plain code fences as display_fence', () => {
    const content = 'Here is an example:\n```python\nprint("hi")\n```\nDone.'
    const segs = parseAssistantContent(content)
    expect(segs.some((s) => s.type === 'display_fence' && s.language === 'python')).toBe(true)
    expect(segs.some((s) => s.type === 'proposed_edit')).toBe(false)
  })

  it('keeps SEARCH/REPLACE as proposed_edit', () => {
    const content = '```\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n```'
    const segs = parseAssistantContent(content)
    expect(segs.some((s) => s.type === 'proposed_edit')).toBe(true)
  })

  it('detects search replace in body', () => {
    expect(isSearchReplaceBlock('<<<<<<< SEARCH\nx')).toBe(true)
  })

  it('drops path-only fence before proposed edit', () => {
    const content = `Plan:\n\`\`\`\nsrc/example.ts\n\`\`\`\n\`\`\`text\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n\`\`\``
    const segs = parseAssistantContent(content)
    const fences = segs.filter((s) => s.type === 'display_fence')
    const proposed = segs.filter((s) => s.type === 'proposed_edit')
    expect(fences.length).toBe(0)
    expect(proposed.length).toBe(1)
  })

  it('promotes raw SEARCH/REPLACE in prose to proposed_edit', () => {
    const content = 'Here:\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE'
    const segs = parseAssistantContent(content)
    expect(segs.some((s) => s.type === 'prose' && s.content.includes('Here'))).toBe(true)
    expect(segs.some((s) => s.type === 'proposed_edit')).toBe(true)
    expect(segs.some((s) => s.type === 'prose' && s.content.includes('<<<<<<<'))).toBe(false)
  })

})
