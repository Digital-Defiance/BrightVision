import { describe, expect, it } from 'vitest'
import { shouldOfferRouterEscalate } from './modelRouterEscalate'

describe('shouldOfferRouterEscalate', () => {
  it('offers code escalate when fast tier had no edits on code task', () => {
    expect(
      shouldOfferRouterEscalate(
        { tier: 'fast', model: 'ollama_chat/small' },
        {
          editedFiles: [],
          userMessage: 'implement the login form',
          escalateOnFailureEnabled: true,
        }
      )
    ).toEqual({ offer: true, target: 'code' })
  })

  it('offers think escalate when code tier stalled on reasoning task', () => {
    expect(
      shouldOfferRouterEscalate(
        { tier: 'code', model: 'ollama_chat/code' },
        {
          editedFiles: [],
          userMessage: 'Refactor the auth architecture',
          escalateOnFailureEnabled: true,
        }
      )
    ).toEqual({ offer: true, target: 'think' })
  })

  it('declines when already on think or edits present', () => {
    expect(
      shouldOfferRouterEscalate(
        { tier: 'think', model: 'ollama_chat/r1' },
        {
          editedFiles: [],
          userMessage: 'implement x',
          escalateOnFailureEnabled: true,
        }
      )
    ).toEqual({ offer: false, target: 'code' })
    expect(
      shouldOfferRouterEscalate(
        { tier: 'fast', model: 'ollama_chat/small' },
        {
          editedFiles: ['a.ts'],
          userMessage: 'implement x',
          escalateOnFailureEnabled: true,
        }
      )
    ).toEqual({ offer: false, target: 'code' })
  })
})
