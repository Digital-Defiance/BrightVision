import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { VisionCommand } from '../ipc/commands'
import { nextSlashCommandCompletion } from '../utils/commandComplete'
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
  const commandTabIndex = useRef(0)
  const pathPrefix = parseFileCommandInput(inputValue)?.pathPrefix ?? ''
  const slashToken = inputValue.trimStart().split(/\s/)[0] ?? ''

  useEffect(() => {
    pathTabIndex.current = 0
  }, [pathPrefix, pathSuggestions.length])

  useEffect(() => {
    commandTabIndex.current = 0
  }, [slashToken, commands.length])

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
        const completed = nextSlashCommandCompletion(
          commands,
          inputValue,
          commandTabIndex.current
        )
        if (completed) {
          e.preventDefault()
          commandTabIndex.current += 1
          const lead = inputValue.match(/^\s*/)?.[0] ?? ''
          const withSpace = completed.includes(' ') ? completed : `${completed} `
          onPickCommand(lead + withSpace)
        }
      }
    }
  }

  const onPickPath = (path: string) => {
    onInputChange(replaceFileCommandPath(inputValue, path))
  }

  return { onKeyDown, onPickPath }
}
