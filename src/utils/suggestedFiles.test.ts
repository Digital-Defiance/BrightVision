import { describe, expect, it } from 'vitest'
import {
  buildQueuedAddMessages,
  buildSuggestedFileEntries,
  extractAnswerSection,
  extractSuggestedFilePaths,
  mergeSuggestedPaths,
  parseAddCommandPath,
} from './suggestedFiles'

const KIRO_SPEC_ANSWER = `Answer
Based on your goal to deepen Kiro/EARS spec-driven development support, the following files are the most critical and will likely need modifications to handle spec generation, parsing, storage, and UI integration:

**Backend (Python)**
- \`bright-vision-core/bright_vision_core/todo_spec_generate.py\` (LLM prompt building & spec layer parsing)
- \`bright-vision-core/bright_vision_core/workspace_todos.py\` (Todo store, spec file syncing, markdown import/export)
- \`bright-vision-core/bright_vision_core/session.py\` (\`generate_todo_layers\` execution & session integration)
- \`bright-vision-core/bright_vision_core/todo_markdown.py\` (EARS/spec markdown serialization & merging)

**Frontend (TypeScript/React)**
- \`src/todos/types.ts\` (Type definitions for specs, requirements, design, tasks)
- \`src/todos/templates.ts\` (Default spec/EARS templates applied to new todos)
- \`src/hooks/useWorkspaceTodos.ts\` (State management & API calls for spec updates)

Please add these files to the chat when you're ready, and let me know exactly which EARS/Kiro features or spec workflows you want to prioritize first (e.g., stricter EARS syntax validation, multi-file spec syncing, UI enhancements for spec layers, etc.). I'll wait for your input before proposing any changes.`

describe('suggestedFiles', () => {
  it('extracts Answer section', () => {
    const answer = extractAnswerSection(KIRO_SPEC_ANSWER)
    expect(answer).toContain('Kiro/EARS spec-driven')
    expect(answer).not.toContain('Please add these files')
  })

  it('extracts backtick paths from spec-driven file list', () => {
    const paths = extractSuggestedFilePaths(KIRO_SPEC_ANSWER)
    expect(paths).toEqual([
      'bright-vision-core/bright_vision_core/session.py',
      'bright-vision-core/bright_vision_core/todo_markdown.py',
      'bright-vision-core/bright_vision_core/todo_spec_generate.py',
      'bright-vision-core/bright_vision_core/workspace_todos.py',
      'src/hooks/useWorkspaceTodos.ts',
      'src/todos/templates.ts',
      'src/todos/types.ts',
    ])
  })

  it('builds separate /add messages for the queue', () => {
    const paths = extractSuggestedFilePaths(KIRO_SPEC_ANSWER)
    expect(buildQueuedAddMessages(paths)).toEqual([
      '/add bright-vision-core/bright_vision_core/session.py',
      '/add bright-vision-core/bright_vision_core/todo_markdown.py',
      '/add bright-vision-core/bright_vision_core/todo_spec_generate.py',
      '/add bright-vision-core/bright_vision_core/workspace_todos.py',
      '/add src/hooks/useWorkspaceTodos.ts',
      '/add src/todos/templates.ts',
      '/add src/todos/types.ts',
    ])
  })

  it('skips paths already in chat', () => {
    const entries = buildSuggestedFileEntries(KIRO_SPEC_ANSWER, [
      'src/todos/types.ts',
      'src/todos/templates.ts',
    ])
    expect(entries.map((e) => e.path)).not.toContain('src/todos/types.ts')
    expect(entries.length).toBe(5)
  })

  it('parses /add command paths', () => {
    expect(parseAddCommandPath('/add src/foo.ts')).toBe('src/foo.ts')
    expect(parseAddCommandPath('/add  ')).toBeNull()
    expect(parseAddCommandPath('hello')).toBeNull()
  })

  it('merges session tray without duplicates and respects files_in_chat', () => {
    const first = mergeSuggestedPaths([], KIRO_SPEC_ANSWER)
    expect(first.length).toBe(7)
    const second = mergeSuggestedPaths(first, KIRO_SPEC_ANSWER)
    expect(second).toEqual(first)
    const filtered = mergeSuggestedPaths(first, KIRO_SPEC_ANSWER, ['src/todos/types.ts'])
    expect(filtered).not.toContain('src/todos/types.ts')
    expect(filtered.length).toBe(6)
  })
})
