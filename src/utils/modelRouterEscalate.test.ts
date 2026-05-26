import { describe, expect, it } from 'vitest'
import { shouldOfferRouterEscalate } from './modelRouterEscalate'

describe('shouldOfferRouterEscalate', () => {
  it('offers when fast tier had no edits on code task', () => {
    expect(
      shouldOfferRouterEscalate(
        { tier: 'fast', model: 'ollama_chat/small' },
        {
          editedFiles: [],
          userMessage: 'implement the login form',
          escalateOnFailureEnabled: true,
        }
      )
    ).toBe(true)
  })

  it('declines when heavy or edits present', () => {
    expect(
      shouldOfferRouterEscalate(
        { tier: 'heavy', model: 'ollama_chat/big' },
        {
          editedFiles: [],
          userMessage: 'implement x',
          escalateOnFailureEnabled: true,
        }
      )
    ).toBe(false)
    expect(
      shouldOfferRouterEscalate(
        { tier: 'fast', model: 'ollama_chat/small' },
        {
          editedFiles: ['a.ts'],
          userMessage: 'implement x',
          escalateOnFailureEnabled: true,
        }
      )
    ).toBe(false)
  })
})
