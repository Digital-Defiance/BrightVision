export interface SendTodoMessageOptions {
  activeTodoId: string
  injectTodoSpec: boolean
}

export interface SendTodoLike {
  id: string
}

/**
 * Resolve active task + spec inject flags for the next chat send.
 * Pending binding from Tasks tab (Start/Resume/Implement) wins over global activeTodo.
 */
export function resolveSendTodoOptions(
  pending: SendTodoMessageOptions | null,
  activeTodo: SendTodoLike | null,
  lastInjectedTodoId: string | null
): SendTodoMessageOptions | undefined {
  if (pending) {
    return pending
  }
  if (!activeTodo) return undefined
  return {
    activeTodoId: activeTodo.id,
    injectTodoSpec: lastInjectedTodoId !== activeTodo.id,
  }
}
