import type { Extension } from '@codemirror/state'
import type { OptionalEditorLanguagePluginId } from './languageRegistry'

type PluginLoader = () => Promise<Extension[]>

/** Static import map only — never load packages outside this record. */
const LOADERS: Record<OptionalEditorLanguagePluginId, PluginLoader> = {
  cpp: async () => {
    const { cpp } = await import('@codemirror/lang-cpp')
    return [cpp()]
  },
  java: async () => {
    const { java } = await import('@codemirror/lang-java')
    return [java()]
  },
  php: async () => {
    const { php } = await import('@codemirror/lang-php')
    return [php()]
  },
  sql: async () => {
    const { sql } = await import('@codemirror/lang-sql')
    return [sql()]
  },
  xml: async () => {
    const { xml } = await import('@codemirror/lang-xml')
    return [xml()]
  },
  vue: async () => {
    const { vue } = await import('@codemirror/lang-vue')
    return [vue()]
  },
  sass: async () => {
    const { sass } = await import('@codemirror/lang-sass')
    return [sass()]
  },
  dockerfile: async () => {
    const { StreamLanguage } = await import('@codemirror/language')
    const { dockerFile } = await import('@codemirror/legacy-modes/mode/dockerfile')
    return [StreamLanguage.define(dockerFile)]
  },
  cmake: async () => {
    const { StreamLanguage } = await import('@codemirror/language')
    const { cmake } = await import('@codemirror/legacy-modes/mode/cmake')
    return [StreamLanguage.define(cmake)]
  },
}

const cache = new Map<OptionalEditorLanguagePluginId, Extension[]>()

export function clearOptionalLanguagePluginCache(): void {
  cache.clear()
}

export async function loadOptionalEditorLanguagePlugin(
  id: OptionalEditorLanguagePluginId
): Promise<Extension[]> {
  const hit = cache.get(id)
  if (hit) return hit

  const loader = LOADERS[id]
  try {
    const extensions = await loader()
    cache.set(id, extensions)
    return extensions
  } catch {
    return []
  }
}
