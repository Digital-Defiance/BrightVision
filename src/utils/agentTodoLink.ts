/** Cecli agent todo.txt ↔ workspace Tasks link markers (see bright_vision_core/agent_todos.py). */

export const AGENT_PLAN_LINK = 'cecli:agent-todo'
const AGENT_TODO_LINK_PREFIX = 'cecli:agent-todo:'

export function isAgentLinkedTask(links: string[] | undefined): boolean {
  if (!links?.length) return false
  return links.some(
    (link) => link === AGENT_PLAN_LINK || link.startsWith(AGENT_TODO_LINK_PREFIX)
  )
}
