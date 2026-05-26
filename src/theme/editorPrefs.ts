import { readStorageItem } from '../storageKeys'

export const EDITOR_PREFS_STORAGE_KEY = 'bright-vision-editor-prefs'

export interface EditorPrefs {
  explorerOpen: boolean
  explorerSizePct: number
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  explorerOpen: false,
  explorerSizePct: 28,
}

export function loadEditorPrefs(): EditorPrefs {
  try {
    const raw = readStorageItem(EDITOR_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_EDITOR_PREFS }
    const parsed = JSON.parse(raw) as Partial<EditorPrefs>
    return {
      explorerOpen: parsed.explorerOpen ?? DEFAULT_EDITOR_PREFS.explorerOpen,
      explorerSizePct:
        typeof parsed.explorerSizePct === 'number'
          ? Math.min(50, Math.max(15, parsed.explorerSizePct))
          : DEFAULT_EDITOR_PREFS.explorerSizePct,
    }
  } catch {
    return { ...DEFAULT_EDITOR_PREFS }
  }
}

export function saveEditorPrefs(prefs: EditorPrefs): void {
  localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, JSON.stringify(prefs))
}
