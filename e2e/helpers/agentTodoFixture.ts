import fs from 'node:fs'
import path from 'node:path'

/**
 * JSON array some local models emit as one `tasks` string per character (UpdateTodoList quirk).
 * Typical after /agent when the fast model calls UpdateTodoList with char-split args.
 */
export const CHAR_SPLIT_AGENT_TODO_JSON =
  '[{"task": "Explore the codebase", "done": false, "current": true},' +
  '{"task": "Draft roadmap items", "done": false}]'

/** Write Cecli agent todo.txt (format from UpdateTodoList). Returns repo-relative path. */
export function writeAgentTodoFile(
  workspaceRoot: string,
  content: string,
  sessionId = 'e2e-integration',
  date = '2026-05-27'
): string {
  const rel = `.cecli/agents/${date}/${sessionId}/todo.txt`
  const abs = path.join(workspaceRoot, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
  return rel
}

/** One checklist line per JSON character (pre-recovery corruption). */
export function writeCharSplitCorruptedAgentTodoFile(
  workspaceRoot: string,
  sessionId = 'char-split-e2e'
): string {
  const lines = [
    'Remaining:',
    ...CHAR_SPLIT_AGENT_TODO_JSON.split('').map((ch) => `○ ${ch}`),
    '',
  ]
  return writeAgentTodoFile(workspaceRoot, lines.join('\n'), sessionId)
}

/** False when char-split debris leaked into Tasks title (e.g. ``[``). */
export function agentPlanTitleLooksValid(title: string | undefined): boolean {
  if (!title?.trim()) return false
  if (title === '[' || title === '{' || title === '"') return false
  return title.trim().length > 2
}
