/**
 * Allowlisted optional editor language packs (CodeMirror 6).
 * Only ids listed here can be loaded — no arbitrary npm packages or remote code.
 */

export interface OptionalEditorLanguagePlugin {
  id: string
  label: string
  description: string
  /** File extensions without leading dot (lowercase). */
  extensions: readonly string[]
  packageName: string
  license: string
}

export const OPTIONAL_EDITOR_LANGUAGE_PLUGINS = [
  {
    id: 'cpp',
    label: 'C / C++',
    description: 'C and C++ source and headers',
    extensions: ['c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'ino'],
    packageName: '@codemirror/lang-cpp',
    license: 'MIT',
  },
  {
    id: 'java',
    label: 'Java',
    description: 'Java source',
    extensions: ['java'],
    packageName: '@codemirror/lang-java',
    license: 'MIT',
  },
  {
    id: 'php',
    label: 'PHP',
    description: 'PHP source',
    extensions: ['php', 'phtml'],
    packageName: '@codemirror/lang-php',
    license: 'MIT',
  },
  {
    id: 'sql',
    label: 'SQL',
    description: 'SQL queries and migrations',
    extensions: ['sql'],
    packageName: '@codemirror/lang-sql',
    license: 'MIT',
  },
  {
    id: 'xml',
    label: 'XML',
    description: 'XML, SVG, XSL, and similar markup',
    extensions: ['xml', 'svg', 'xsl', 'xslt', 'plist', 'xsd', 'dtd'],
    packageName: '@codemirror/lang-xml',
    license: 'MIT',
  },
  {
    id: 'vue',
    label: 'Vue',
    description: 'Vue single-file components',
    extensions: ['vue'],
    packageName: '@codemirror/lang-vue',
    license: 'MIT',
  },
  {
    id: 'sass',
    label: 'Sass',
    description: 'Sass (indented) stylesheets — SCSS uses built-in CSS highlighter',
    extensions: ['sass'],
    packageName: '@codemirror/lang-sass',
    license: 'MIT',
  },
  {
    id: 'dockerfile',
    label: 'Dockerfile',
    description: 'Docker and Containerfile syntax',
    extensions: ['dockerfile'],
    packageName: '@codemirror/legacy-modes',
    license: 'MIT',
  },
  {
    id: 'cmake',
    label: 'CMake',
    description: 'CMake build scripts',
    extensions: ['cmake'],
    packageName: '@codemirror/legacy-modes',
    license: 'MIT',
  },
] as const satisfies readonly OptionalEditorLanguagePlugin[]

export type OptionalEditorLanguagePluginId =
  (typeof OPTIONAL_EDITOR_LANGUAGE_PLUGINS)[number]['id']

const PLUGIN_IDS = new Set<string>(
  OPTIONAL_EDITOR_LANGUAGE_PLUGINS.map((p) => p.id)
)

export function isOptionalEditorLanguagePluginId(
  id: string
): id is OptionalEditorLanguagePluginId {
  return PLUGIN_IDS.has(id)
}

export function sanitizeEnabledOptionalPluginIds(ids: unknown): OptionalEditorLanguagePluginId[] {
  if (!Array.isArray(ids)) return []
  const seen = new Set<OptionalEditorLanguagePluginId>()
  const out: OptionalEditorLanguagePluginId[] = []
  for (const raw of ids) {
    if (typeof raw !== 'string' || !isOptionalEditorLanguagePluginId(raw) || seen.has(raw)) {
      continue
    }
    seen.add(raw)
    out.push(raw)
  }
  return out
}

export function fileExtension(path: string): string | null {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return null
  return base.slice(dot + 1).toLowerCase()
}

/** Dockerfile / Containerfile without extension. */
function dockerfileBasename(path: string): boolean {
  const base = (path.replace(/\\/g, '/').split('/').pop() ?? '').toLowerCase()
  return base === 'dockerfile' || base === 'containerfile'
}

export function matchOptionalEditorPlugin(
  path: string,
  enabledIds: ReadonlySet<string>
): OptionalEditorLanguagePluginId | null {
  if (enabledIds.has('dockerfile') && dockerfileBasename(path)) return 'dockerfile'

  const ext = fileExtension(path)
  if (!ext) return null

  for (const plugin of OPTIONAL_EDITOR_LANGUAGE_PLUGINS) {
    if (!enabledIds.has(plugin.id)) continue
    if ((plugin.extensions as readonly string[]).includes(ext)) return plugin.id
  }
  return null
}

export const BUILTIN_EDITOR_LANGUAGE_SUMMARY =
  'Python, Rust, Go, JavaScript/TypeScript, JSON, Markdown, YAML, TOML, shell, CSS/SCSS, HTML'
