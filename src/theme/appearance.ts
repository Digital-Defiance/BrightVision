/** User-facing font presets — Glass TTY nods to classic Aider terminal aesthetic. */

export type FontPresetId =
  | 'glass-tty'
  | 'jetbrains'
  | 'fira'
  | 'system-mono'
  | 'inter'
  | 'system-ui'
  | 'custom'

export interface AppearanceConfig {
  uiFont: FontPresetId
  chatFont: FontPresetId
  terminalFont: FontPresetId
  uiFontCustom: string
  chatFontCustom: string
  terminalFontCustom: string
}

import { APPEARANCE_STORAGE_KEY } from '../storageKeys'

export { APPEARANCE_STORAGE_KEY }

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  uiFont: 'inter',
  chatFont: 'glass-tty',
  terminalFont: 'jetbrains',
  uiFontCustom: '',
  chatFontCustom: '',
  terminalFontCustom: '',
}

const GLASS_TTY_STACK = '"Glass TTY VT220", "Glass_TTY_VT220", monospace'

/** CSS `font-family` for each preset (no scanline / stripe effects — plain face). */
export const FONT_PRESET_CSS: Record<Exclude<FontPresetId, 'custom'>, string> = {
  'glass-tty': GLASS_TTY_STACK,
  jetbrains: '"JetBrains Mono", "Fira Code", Consolas, monospace',
  fira: '"Fira Code", "JetBrains Mono", Consolas, monospace',
  'system-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  inter: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
  'system-ui': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
}

export const FONT_PRESET_LABELS: Record<FontPresetId, string> = {
  'glass-tty': 'Glass TTY VT220 (classic Aider)',
  jetbrains: 'JetBrains Mono',
  fira: 'Fira Code',
  'system-mono': 'System monospace',
  inter: 'Inter',
  'system-ui': 'System UI',
  custom: 'Custom CSS font-family…',
}

export function resolveFontFamily(
  preset: FontPresetId,
  custom: string
): string {
  if (preset === 'custom') {
    const trimmed = custom.trim()
    return trimmed || FONT_PRESET_CSS.inter
  }
  return FONT_PRESET_CSS[preset]
}

export function resolveAppearanceFonts(config: AppearanceConfig) {
  return {
    ui: resolveFontFamily(config.uiFont, config.uiFontCustom),
    chat: resolveFontFamily(config.chatFont, config.chatFontCustom),
    terminal: resolveFontFamily(config.terminalFont, config.terminalFontCustom),
  }
}

export function applyAppearanceCssVars(config: AppearanceConfig): void {
  const { ui, chat, terminal } = resolveAppearanceFonts(config)
  const root = document.documentElement
  root.style.setProperty('--vision-font-ui', ui)
  root.style.setProperty('--vision-font-chat', chat)
  root.style.setProperty('--vision-font-terminal', terminal)
}

export function loadAppearance(): AppearanceConfig {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_APPEARANCE }
    const parsed = JSON.parse(raw) as Partial<AppearanceConfig>
    return {
      ...DEFAULT_APPEARANCE,
      ...parsed,
      uiFont: isFontPreset(parsed.uiFont) ? parsed.uiFont : DEFAULT_APPEARANCE.uiFont,
      chatFont: isFontPreset(parsed.chatFont) ? parsed.chatFont : DEFAULT_APPEARANCE.chatFont,
      terminalFont: isFontPreset(parsed.terminalFont)
        ? parsed.terminalFont
        : DEFAULT_APPEARANCE.terminalFont,
    }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

export function saveAppearance(config: AppearanceConfig): void {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(config))
}

function isFontPreset(value: unknown): value is FontPresetId {
  return (
    typeof value === 'string' &&
    (value === 'custom' || value in FONT_PRESET_CSS)
  )
}
