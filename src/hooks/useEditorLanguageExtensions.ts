import type { Extension } from '@codemirror/state'
import { useEffect, useMemo, useState } from 'react'
import { loadOptionalEditorLanguagePlugin } from '../editor/loadLanguagePlugin'
import { matchOptionalEditorPlugin } from '../editor/languageRegistry'
import type { OptionalEditorLanguagePluginId } from '../editor/languageRegistry'
import { coreEditorLanguageExtension } from '../utils/editorLanguage'

export function useEditorLanguageExtensions(
  path: string,
  enabledOptionalPluginIds: readonly OptionalEditorLanguagePluginId[]
) {
  const core = useMemo(() => coreEditorLanguageExtension(path), [path])
  const enabledSet = useMemo(
    () => new Set(enabledOptionalPluginIds),
    [enabledOptionalPluginIds]
  )
  const [optional, setOptional] = useState<Extension[]>([])
  const [loadingOptional, setLoadingOptional] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (core.length > 0) {
      setOptional([])
      setLoadingOptional(false)
      return () => {
        cancelled = true
      }
    }

    const pluginId = matchOptionalEditorPlugin(path, enabledSet)
    if (!pluginId) {
      setOptional([])
      setLoadingOptional(false)
      return () => {
        cancelled = true
      }
    }

    setLoadingOptional(true)
    void loadOptionalEditorLanguagePlugin(pluginId).then((extensions) => {
      if (cancelled) return
      setOptional(extensions)
      setLoadingOptional(false)
    })

    return () => {
      cancelled = true
    }
  }, [path, core.length, enabledSet])

  const languageExtensions = useMemo(() => [...core, ...optional], [core, optional])

  return { languageExtensions, loadingOptional }
}
