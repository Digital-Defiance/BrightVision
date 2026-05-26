import { css } from '@codemirror/lang-css'
import { go } from '@codemirror/lang-go'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { javascript } from '@codemirror/lang-javascript'
import { yaml } from '@codemirror/lang-yaml'
import { StreamLanguage } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import type { Extension } from '@codemirror/state'

/** Built-in highlighters (always loaded; not user-toggleable). */
export function coreEditorLanguageExtension(path: string): Extension[] {
  const lower = path.toLowerCase()
  if (lower.endsWith('.py')) return [python()]
  if (lower.endsWith('.rs')) return [rust()]
  if (lower.endsWith('.go')) return [go()]
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) return [json()]
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return [markdown()]
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return [yaml()]
  if (lower.endsWith('.toml')) return [StreamLanguage.define(toml)]
  if (
    lower.endsWith('.sh') ||
    lower.endsWith('.bash') ||
    lower.endsWith('.zsh') ||
    lower.endsWith('.fish')
  ) {
    return [StreamLanguage.define(shell)]
  }
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  ) {
    return [javascript({ typescript: lower.endsWith('.ts') || lower.endsWith('.tsx') })]
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) {
    return [css()]
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return [javascript({ jsx: true, typescript: false })]
  }
  return []
}

/** @deprecated Use coreEditorLanguageExtension + optional plugins via useEditorLanguageExtensions */
export function editorLanguageExtension(path: string): Extension[] {
  return coreEditorLanguageExtension(path)
}
