import { EDITOR_LANGUAGE_PREFS_STORAGE_KEY } from '../storageKeys'
import {
  sanitizeEnabledOptionalPluginIds,
  type OptionalEditorLanguagePluginId,
} from '../editor/languageRegistry'

export { EDITOR_LANGUAGE_PREFS_STORAGE_KEY }

export interface EditorLanguagePrefs {
  /** Allowlisted optional CodeMirror language pack ids (see languageRegistry). */
  enabledOptionalPluginIds: OptionalEditorLanguagePluginId[]
}

export const DEFAULT_EDITOR_LANGUAGE_PREFS: EditorLanguagePrefs = {
  enabledOptionalPluginIds: [],
}

export function loadEditorLanguagePrefs(): EditorLanguagePrefs {
  try {
    const raw = localStorage.getItem(EDITOR_LANGUAGE_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_EDITOR_LANGUAGE_PREFS }
    const parsed = JSON.parse(raw) as Partial<EditorLanguagePrefs>
    return {
      enabledOptionalPluginIds: sanitizeEnabledOptionalPluginIds(
        parsed.enabledOptionalPluginIds
      ),
    }
  } catch {
    return { ...DEFAULT_EDITOR_LANGUAGE_PREFS }
  }
}

export function saveEditorLanguagePrefs(prefs: EditorLanguagePrefs): void {
  localStorage.setItem(EDITOR_LANGUAGE_PREFS_STORAGE_KEY, JSON.stringify(prefs))
}

export function toggleOptionalPlugin(
  prefs: EditorLanguagePrefs,
  id: OptionalEditorLanguagePluginId,
  enabled: boolean
): EditorLanguagePrefs {
  const set = new Set(prefs.enabledOptionalPluginIds)
  if (enabled) set.add(id)
  else set.delete(id)
  return { enabledOptionalPluginIds: [...set] }
}
