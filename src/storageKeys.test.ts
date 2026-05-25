import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  CONFIG_STORAGE_KEY,
  migrateLegacyStorageKeys,
  readStorageItem,
} from './storageKeys'

function mockLocalStorage() {
  const store = new Map<string, string>()
  const ls = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
  vi.stubGlobal('localStorage', ls)
}

describe('storageKeys', () => {
  beforeEach(() => {
    mockLocalStorage()
  })

  it('migrates legacy config key', () => {
    localStorage.setItem('aider-vision-config', '{"model":"x"}')
    migrateLegacyStorageKeys()
    expect(localStorage.getItem(CONFIG_STORAGE_KEY)).toBe('{"model":"x"}')
    expect(localStorage.getItem('aider-vision-config')).toBeNull()
  })

  it('readStorageItem returns current without touching legacy', () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, '{"ok":true}')
    expect(readStorageItem(CONFIG_STORAGE_KEY, 'aider-vision-config')).toBe('{"ok":true}')
  })

  it('migrates appearance on read', () => {
    localStorage.setItem('aider-vision-appearance', '{}')
    readStorageItem(APPEARANCE_STORAGE_KEY, 'aider-vision-appearance')
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('{}')
  })
})
