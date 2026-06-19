import { describe, expect, it } from 'vitest'
import {
  isInsideIncompleteToolCall,
  isNonBreakingToolOutput,
  shouldBreakAssistantStreamForToolEvent,
} from './assistantStreamBreak'

describe('isInsideIncompleteToolCall', () => {
  it('detects open tool_call without close', () => {
    const partial = '<tool_call>\n<function=Local_ReadRange>\n[{"file_path": "'
    expect(isInsideIncompleteToolCall(partial)).toBe(true)
  })

  it('returns false when tool_call is closed', () => {
    const complete = '<tool_call>{"x":1}</tool_call>'
    expect(isInsideIncompleteToolCall(complete)).toBe(false)
  })
})

describe('isNonBreakingToolOutput', () => {
  it('matches undo hint', () => {
    expect(isNonBreakingToolOutput('You can use /undo to undo and discard each cecli commit.')).toBe(
      true
    )
  })

  it('matches edit-failure auto-continue status', () => {
    expect(
      isNonBreakingToolOutput('EditText failed — auto-continuing once with ReadRange guidance…')
    ).toBe(true)
  })
})

describe('shouldBreakAssistantStreamForToolEvent', () => {
  it('does not break mid tool_call for undo hint', () => {
    const stream = '<tool_call>\n[{"file_path": "'
    expect(
      shouldBreakAssistantStreamForToolEvent(
        'You can use /undo to undo and discard each cecli commit.',
        stream
      )
    ).toBe(false)
  })

  it('breaks after tool_call completes', () => {
    const stream = '<tool_call>done</tool_call>'
    expect(shouldBreakAssistantStreamForToolEvent('Tool Call: Local • ReadRange', stream)).toBe(true)
  })
})
