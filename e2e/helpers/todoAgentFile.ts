import fs from 'node:fs'
import path from 'node:path'

export const E2E_TODO_MAGIC = 'bv-todo-9c2e'

/** True when any .cecli/agents/.../todo.txt under workspace contains the magic task text. */
export function workspaceHasAgentTodoMagic(workspaceRoot: string): boolean {
  const agents = path.join(workspaceRoot, '.cecli', 'agents')
  if (!fs.existsSync(agents)) return false
  const agentsSep = `${path.sep}agents${path.sep}`
  const stack = [agents]
  while (stack.length) {
    const dir = stack.pop()!
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) {
        stack.push(full)
      } else if (name === 'todo.txt' && full.includes(agentsSep)) {
        if (fs.readFileSync(full, 'utf8').includes(E2E_TODO_MAGIC)) return true
      }
    }
  }
  return false
}
