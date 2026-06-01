/**
 * Browser localStorage keys for BrightVision settings.
 */

import { PRODUCT_VISION } from './brand'

export const CONFIG_STORAGE_KEY = `${PRODUCT_VISION}-config`
export const APPEARANCE_STORAGE_KEY = `${PRODUCT_VISION}-appearance`
export const THINKING_TIMING_STORAGE_KEY = `${PRODUCT_VISION}-thinking-timing`
export const THINKING_STATS_STORAGE_KEY = `${PRODUCT_VISION}-thinking-stats`
export const RESOURCE_OVERLAY_STORAGE_KEY = `${PRODUCT_VISION}-resource-overlay`
export const SUGGESTED_FILES_STORAGE_KEY = `${PRODUCT_VISION}-suggested-files`
export const EDITOR_LANGUAGE_PREFS_STORAGE_KEY = `${PRODUCT_VISION}-editor-languages`
export const MODEL_ROUTER_PREFS_STORAGE_KEY = `${PRODUCT_VISION}-model-router`
export const NTFY_ALERTS_STORAGE_KEY = `${PRODUCT_VISION}-ntfy-alerts`
export const SPEC_FOCUS_STORAGE_KEY = `${PRODUCT_VISION}-spec-focus`

/** Read key; returns null when unset. */
export function readStorageItem(currentKey: string): string | null {
  return localStorage.getItem(currentKey)
}

/** No-op — retained for callers on app boot. */
export function migrateLegacyStorageKeys(): void {}

export function removeStorageKeys(keys: string[]): void {
  for (const key of keys) {
    localStorage.removeItem(key)
  }
}
