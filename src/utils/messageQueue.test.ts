import { describe, expect, it } from 'vitest'
import { formatQueueChipLabel, formatQueuePreview } from './messageQueue'

describe('messageQueue', () => {
  it('formats preview and chip label', () => {
    expect(formatQueuePreview('hello world')).toBe('hello world')
    expect(formatQueuePreview('  multi\nline  ')).toBe('multi line')
    expect(formatQueueChipLabel(3)).toBe('3 messages queued')
    expect(formatQueueChipLabel(1)).toBe('1 message queued')
  })
})
