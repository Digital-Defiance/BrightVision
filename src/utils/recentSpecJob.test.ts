import { describe, expect, it } from 'vitest'
import { specJobChipLabel } from './recentSpecJob'

describe('specJobChipLabel', () => {
  it('labels failed jobs for post-crash export', () => {
    expect(
      specJobChipLabel({
        id: 'abc12345-6789',
        outcome: 'session_lost',
        prompt: null,
        mode: null,
        section: null,
      })
    ).toContain('session ended')
  })
})
