/**
 * Event shapes from aider-vision-core Session / EventIO / vision_jsonl worker.
 * Keep aligned with aider-vision-core/aider_vision_core/event_io.py and session.py.
 */

export type CoreEventType =
  | 'user_message'
  | 'token'
  | 'tool_output'
  | 'tool_error'
  | 'tool_warning'
  | 'confirm'
  | 'assistant_complete'
  | 'done'
  | 'error'

export interface CoreEventBase {
  type: CoreEventType | string
  text?: string
  [key: string]: unknown
}

export interface CoreTokenEvent extends CoreEventBase {
  type: 'token'
  text: string
}

export interface CoreDoneEvent extends CoreEventBase {
  type: 'done'
  assistant_text?: string
  edited_files?: string[]
  commit_hash?: string
  commit_message?: string
  commits?: unknown
  error?: boolean
}

export interface CoreConfirmEvent extends CoreEventBase {
  type: 'confirm'
  question: string
  subject?: string
  default?: boolean
  auto_answered?: boolean
}

export function isCoreEvent(value: unknown): value is CoreEventBase {
  return typeof value === 'object' && value !== null && 'type' in value
}
