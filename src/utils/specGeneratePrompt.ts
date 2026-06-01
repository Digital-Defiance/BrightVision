import { defaultRefinePrompt } from './specTraceHint'

export function resolveSpecGeneratePrompt(
  draft: string,
  todoTitle: string | undefined,
  mode: 'generate' | 'refine'
): string {
  const trimmed = draft.trim()
  if (trimmed) return trimmed
  if (mode === 'refine') return defaultRefinePrompt()
  const title = todoTitle?.trim()
  if (title) return `Feature: ${title}`
  return 'Generate spec layers'
}

export function truncatePromptPreview(prompt: string, maxLen = 80): string {
  const oneLine = prompt.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= maxLen) return oneLine
  return `${oneLine.slice(0, maxLen - 1)}…`
}
