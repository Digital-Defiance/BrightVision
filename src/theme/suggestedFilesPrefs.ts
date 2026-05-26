import { SUGGESTED_FILES_STORAGE_KEY } from '../storageKeys'

export { SUGGESTED_FILES_STORAGE_KEY }

/** User message sent after suggested files land in context (cecli / aider convention). */
export const PROCEED_AFTER_FILES_MESSAGE = 'proceed'

export interface SuggestedFilesPrefs {
  /** After the model asks to add files, call `addFiles` for the tray list without prompting. */
  autoAddSuggested: boolean
  /** After a successful auto- or manual add-all, send {@link PROCEED_AFTER_FILES_MESSAGE}. */
  autoProceedAfterAdd: boolean
}

export const DEFAULT_SUGGESTED_FILES_PREFS: SuggestedFilesPrefs = {
  autoAddSuggested: false,
  autoProceedAfterAdd: false,
}

export function loadSuggestedFilesPrefs(): SuggestedFilesPrefs {
  try {
    const raw = localStorage.getItem(SUGGESTED_FILES_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SUGGESTED_FILES_PREFS }
    const parsed = JSON.parse(raw) as Partial<SuggestedFilesPrefs>
    return { ...DEFAULT_SUGGESTED_FILES_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_SUGGESTED_FILES_PREFS }
  }
}

export function saveSuggestedFilesPrefs(prefs: SuggestedFilesPrefs): void {
  localStorage.setItem(SUGGESTED_FILES_STORAGE_KEY, JSON.stringify(prefs))
}
