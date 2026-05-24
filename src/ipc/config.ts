/** Shared settings — React is the head; core is headless under {@link CORE_ENGINE_DIR}. */

import { isTauriRuntime } from './isTauri'

/** Embedded engine tree relative to workspace (submodule / translocated body). */
export const CORE_ENGINE_DIR = 'aider-vision-core'

export interface AiderConfig {
  model: string
  extraParams: string
  /** Git project the agent edits (any repo; does not need aider-vision-core inside it). */
  workingDir: string
  autoApproveLimit: number
  /** Relative path to core under the AV app install (desktop spawn only). */
  coreEnginePath: string
  pythonPath: string
  /**
   * Core HTTP API. Desktop: filled by Tauri after `start_core_api`.
   * Web: `aider-vision-core-serve` or Vite proxy `/api/core`.
   */
  coreApiUrl: string
  coreApiToken: string
  /** Optional paths (relative to workspace) added to the core session. */
  contextFiles: string[]
}

export const DEFAULT_CONFIG: AiderConfig = {
  model: 'ollama_chat/qwen3.6:27b-q4_K_M',
  extraParams: '{"think": false}',
  workingDir: '.',
  autoApproveLimit: 0,
  coreEnginePath: CORE_ENGINE_DIR,
  pythonPath: '',
  coreApiUrl: 'http://127.0.0.1:8741',
  coreApiToken: '',
  contextFiles: [],
}

export function parseContextFilesInput(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function formatContextFilesInput(files: string[]): string {
  return files.join('\n')
}

/** @deprecated use coreEnginePath */
export type WorkerMode = 'jsonl'
export type TransportMode = 'api'

export function defaultCoreApiUrl(): string {
  if (typeof window !== 'undefined' && !isTauriRuntime()) {
    return '/api/core'
  }
  return DEFAULT_CONFIG.coreApiUrl
}
