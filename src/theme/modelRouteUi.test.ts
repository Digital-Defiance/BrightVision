import { describe, expect, it } from 'vitest'
import {
  formatModelRouteTooltip,
  isLegacyModelRouterSystemMessage,
  modelRouteRoleLabel,
} from './modelRouteUi'

describe('modelRouteUi', () => {
  it('formats hover tooltip with tier label and model', () => {
    expect(
      formatModelRouteTooltip({
        tier: 'code',
        role: 'code',
        model: 'ollama_chat/qwen3.6:27b',
        enable_thinking: false,
      })
    ).toBe('Engineer: qwen3.6:27b · think off')
  })

  it('labels tiers for force bar copy', () => {
    expect(modelRouteRoleLabel('fast')).toBe('Fighter pilot')
    expect(modelRouteRoleLabel('think')).toBe('Architect')
    expect(modelRouteRoleLabel('code')).toBe('Engineer')
  })

  it('detects legacy router system bubbles', () => {
    expect(isLegacyModelRouterSystemMessage('Model router: Engineer: x')).toBe(true)
    expect(isLegacyModelRouterSystemMessage('Session started')).toBe(false)
  })
})
