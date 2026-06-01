import { SPEC_FOCUS_STORAGE_KEY } from '../storageKeys'

export function loadSpecFocusPref(): boolean {
  try {
    return localStorage.getItem(SPEC_FOCUS_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSpecFocusPref(enabled: boolean): void {
  try {
    localStorage.setItem(SPEC_FOCUS_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* private mode / quota */
  }
}
