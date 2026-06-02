import { describe, expect, it } from 'vitest'
import { parseAssistantContent } from './proposedEdits'

describe('parseAssistantContent json blocks', () => {
  it('surfaces raw JSON prose as json_block', () => {
    const segs = parseAssistantContent('{ "path": "curl-reference-code" }')
    expect(segs).toHaveLength(1)
    expect(segs[0].type).toBe('json_block')
    if (segs[0].type === 'json_block') {
      expect(segs[0].value).toEqual({ path: 'curl-reference-code' })
    }
  })

  it('surfaces fenced JSON as json_block', () => {
    const segs = parseAssistantContent('```\n{ "path": "src" }\n```')
    expect(segs.some((s) => s.type === 'json_block')).toBe(true)
  })

  it('keeps normal prose as prose', () => {
    const segs = parseAssistantContent('Analyze the repo layout.')
    expect(segs).toEqual([{ type: 'prose', content: 'Analyze the repo layout.' }])
  })
})
