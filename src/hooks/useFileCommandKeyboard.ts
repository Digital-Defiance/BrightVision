import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { VisionCommand } from '../ipc/commands'
import { parseFileCommandInput, replaceFileCommandPath } from '../utils/fileCommandComplete'

export interface UseFileCommandKeyboardOptions {
  inputValue: string
  pathSuggestions: string[]
  pathAssistActive: boolean
  commands: VisionCommand[]
  onInputChange: (value: string) => void
  onPickCommand: (command: string) => void
  onSend: () => void
}

/** Tab-complete `/add` paths and `/` commands; Enter sends (Shift+Enter newline in multiline fields). */
export function useFileCommandKeyboard({
  inputValue,
  pathSuggestions,
  pathAssistActive,
  commands,
  onInputChange,
  onPickCommand,
  onSend,
}: UseFileCommandKeyboardOptions) {
  const pathTabIndex = useRef(0)
  const pathPrefix = parseFileCommandInput(inputValue)?.pathPrefix ?? ''

  useEffect(() => {
    pathTabIndex.current = 0
  }, [pathPrefix, pathSuggestions.length])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
      return
    }
    if (e.key === 'Tab') {
      if (pathAssistActive && pathSuggestions.length > 0) {
        e.preventDefault()
        const idx = pathTabIndex.current % pathSuggestions.length
        pathTabIndex.current = idx + 1
        onInputChange(replaceFileCommandPath(inputValue, pathSuggestions[idx]))
        return
      }
      if (inputValue.trim().startsWith('/')) {
        const token = inputValue.trim().split(/\s/)[0] ?? ''
        const match = commands.find((c) => c.name.toLowerCase().startsWith(token.toLowerCase()))
        if (match && match.name !== token) {
          e.preventDefault()
          onPickCommand(
            match.name + (inputValue.includes(' ') ? inputValue.slice(token.length) : ' ')
          )
        }
      }
    }
  }

  const onPickPath = (path: string) => {
    onInputChange(replaceFileCommandPath(inputValue, path))
  }

  return { onKeyDown, onPickPath }
}
