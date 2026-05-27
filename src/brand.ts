/**
 * Product identity — keep in sync with bright-vision-core/bright_vision_core/brand.py
 */

import headerLogoPng from './assets/brand/bright-vision-horiz-bold-tx-white.png'
import railLogoPng from './assets/brand/bright_vision_bold_logo-tx.png'

export const PRODUCT_VISION = 'bright-vision'
export const PRODUCT_CORE = 'bright-vision-core'

export const DISPLAY_VISION = 'BrightVision'
/** HTTP/SSE layer (`bright_vision_core` on :8741) — not the Cecli agent loop. */
export const DISPLAY_VISION_API = 'Vision API'
export const DISPLAY_CORE = 'Cecli'
/** Sidebar rail fallback if logo fails to load */
export const DISPLAY_MONOGRAM = 'BV'

/** Public credit for the Cecli maintainers — keep in sync with bright_vision_core/brand.py */
export const CECLI_HOME_URL = 'https://cecli.dev'
export const CECLI_GITHUB_URL = 'https://github.com/dwash96/cecli'

/** Per-project metadata tree (shared with Cecli). Keep in sync with bright_vision_core/brand.py */
export const WORKSPACE_META_DIR = '.cecli'

/**
 * `vector` — inline SVG wordmark; Inter Black/Thin from `src/assets/fonts/`.
 * `png` — raster fallbacks in `src/assets/brand/*.png`.
 */
export const BRAND_LOGO_MODE: 'png' | 'vector' = 'vector'

/** Wordmark faces (see `global.scss` @font-face). */
export const BRAND_WORDMARK_FONTS = ['Inter-Black.woff2', 'Inter-Thin.woff2'] as const

/** Chat/terminal preset (not the logo). */
export const BRAND_CHAT_FONT_FILE = 'Glass_TTY_VT220.woff2'

/** @deprecated use BRAND_CHAT_FONT_FILE */
export const BRAND_FONT_FILE = BRAND_CHAT_FONT_FILE

export const BRAND_HEADER_LOGO_PNG = headerLogoPng
export const BRAND_RAIL_LOGO_PNG = railLogoPng

/** @deprecated use BrandLogo component */
export const BRAND_HEADER_LOGO = headerLogoPng
/** @deprecated use BrandLogo component */
export const BRAND_RAIL_LOGO = railLogoPng

/** App shell failures (invoke, spawn, UI). */
export type ErrorSource = 'vision' | 'core'

/**
 * Prefix for errors shown in the main UI (chat, toasts).
 * Agent stderr is shown as BrightVision — users opened the app, not pip.
 */
export function prefixForUserFacing(_source: ErrorSource): string {
  return `[${DISPLAY_VISION}]`
}

/** Prefix for the technical / terminal log tab. */
export function prefixForTechnicalLog(): string {
  return `[${DISPLAY_CORE}]`
}

export function labelForSource(source: ErrorSource): string {
  return source === 'vision' ? DISPLAY_VISION : DISPLAY_CORE
}

/** @deprecated use prefixForUserFacing / prefixForTechnicalLog */
export function prefixForSource(source: ErrorSource): string {
  return source === 'vision' ? `[${DISPLAY_VISION}]` : `[${DISPLAY_CORE}]`
}
