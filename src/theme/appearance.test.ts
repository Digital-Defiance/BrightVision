import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APPEARANCE,
  resolveAppearanceFonts,
  resolveFontFamily,
} from './appearance'

describe('appearance fonts', () => {
  it('defaults chat to Inter', () => {
    expect(DEFAULT_APPEARANCE.chatFont).toBe('inter')
    expect(resolveFontFamily('inter', '')).toContain('Inter')
  })

  it('still offers Glass TTY preset', () => {
    expect(resolveFontFamily('glass-tty', '')).toContain('Glass TTY VT220')
  })

  it('uses custom stack when preset is custom', () => {
    expect(resolveFontFamily('custom', 'Georgia, serif')).toBe('Georgia, serif')
  })

  it('resolves ui chat and terminal independently', () => {
    const fonts = resolveAppearanceFonts({
      ...DEFAULT_APPEARANCE,
      uiFont: 'system-ui',
      chatFont: 'glass-tty',
      terminalFont: 'fira',
    })
    expect(fonts.ui).toContain('system-ui')
    expect(fonts.chat).toContain('Glass TTY')
    expect(fonts.terminal).toContain('Fira Code')
  })
})
