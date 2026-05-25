/**
 * Browser localStorage keys — migrate once from legacy `aider-vision-*` names.
 */

import { PRODUCT_VISION } from './brand'

const LEGACY_PREFIX = 'aider-vision'

export const CONFIG_STORAGE_KEY = `${PRODUCT_VISION}-config`
export const APPEARANCE_STORAGE_KEY = `${PRODUCT_VISION}-appearance`
export const THINKING_TIMING_STORAGE_KEY = `${PRODUCT_VISION}-thinking-timing`
export const THINKING_STATS_STORAGE_KEY = `${PRODUCT_VISION}-thinking-stats`
export const RESOURCE_OVERLAY_STORAGE_KEY = `${PRODUCT_VISION}-resource-overlay`

const MIGRATIONS: Array<{ current: string; legacy: string }> = [
  { current: CONFIG_STORAGE_KEY, legacy: `${LEGACY_PREFIX}-config` },
  { current: APPEARANCE_STORAGE_KEY, legacy: `${LEGACY_PREFIX}-appearance` },
  { current: THINKING_TIMING_STORAGE_KEY, legacy: `${LEGACY_PREFIX}-thinking-timing` },
  { current: THINKING_STATS_STORAGE_KEY, legacy: `${LEGACY_PREFIX}-thinking-stats` },
  { current: RESOURCE_OVERLAY_STORAGE_KEY, legacy: `${LEGACY_PREFIX}-resource-overlay` },
]

/** Read key, copying legacy value forward when present. */
export function readStorageItem(currentKey: string, legacyKey?: string): string | null {
  const value = localStorage.getItem(currentKey)
  if (value !== null) return value
  if (!legacyKey) return null
  const legacy = localStorage.getItem(legacyKey)
  if (legacy === null) return null
  localStorage.setItem(currentKey, legacy)
  localStorage.removeItem(legacyKey)
  return legacy
}

/** Run all known migrations (safe to call on app boot). */
export function migrateLegacyStorageKeys(): void {
  for (const { current, legacy } of MIGRATIONS) {
    readStorageItem(current, legacy)
  }
}

export function removeStorageKeys(keys: string[]): void {
  for (const key of keys) {
    localStorage.removeItem(key)
    const legacy = key.replace(PRODUCT_VISION, LEGACY_PREFIX)
    if (legacy !== key) localStorage.removeItem(legacy)
  }
}
