import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  CONFIG_STORAGE_KEY,
  migrateLegacyStorageKeys,
  readStorageItem,
  removeStorageKeys,
} from './storageKeys'

function mockLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  })
}

describe('storageKeys', () => {
  beforeEach(() => {
    mockLocalStorage()
  })

  it('migrateLegacyStorageKeys is safe to call', () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, '{"model":"x"}')
    migrateLegacyStorageKeys()
    expect(localStorage.getItem(CONFIG_STORAGE_KEY)).toBe('{"model":"x"}')
  })

  it('readStorageItem returns stored value', () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, '{"ok":true}')
    expect(readStorageItem(CONFIG_STORAGE_KEY)).toBe('{"ok":true}')
  })

  it('removeStorageKeys clears keys', () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, '{}')
    localStorage.setItem(APPEARANCE_STORAGE_KEY, '{}')
    removeStorageKeys([CONFIG_STORAGE_KEY, APPEARANCE_STORAGE_KEY])
    expect(localStorage.getItem(CONFIG_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull()
  })
})
