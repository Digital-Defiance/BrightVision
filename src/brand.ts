/**
 * Product identity — keep in sync with aider-vision-core/aider_vision_core/brand.py
 */

import headerLogoPng from './assets/brand/aider-vision.png'
import railLogoPng from './assets/brand/aider-vision-square-logo.png'

export const PRODUCT_VISION = 'aider-vision'
export const PRODUCT_CORE = 'aider-vision-core'

export const DISPLAY_VISION = 'Aider Vision'
export const DISPLAY_CORE = 'Aider Vision Core'
/** Sidebar rail monogram (fallback if logo fails to load) */
export const DISPLAY_MONOGRAM = 'AV'

/**
 * `vector` — inline SVG + Glass TTY VT220 from `src/assets/fonts/Glass_TTY_VT220.woff2`.
 * `png` — raster fallbacks in `src/assets/brand/*.png`.
 */
export const BRAND_LOGO_MODE: 'png' | 'vector' = 'vector'

/** Expected path (commit the woff2 beside this constant’s folder). */
export const BRAND_FONT_FILE = 'Glass_TTY_VT220.woff2'

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
 * Agent stderr is shown as Aider Vision — users opened the app, not pip.
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
