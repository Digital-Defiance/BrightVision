/** Append a `/turns` assistant message (React table rendered in ChatPanel). */
export function appendTurnsTableToChat(
  appendAssistantMessage: (msg: {
    content: string
    turnsTable: { filterModel: string | null; capturedAt: string }
  }) => void,
  opts?: { filterModel?: string | null }
): void {
  appendAssistantMessage({
    content: '/turns',
    turnsTable: {
      filterModel: opts?.filterModel ?? null,
      capturedAt: new Date().toISOString(),
    },
  })
}
