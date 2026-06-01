/** Shared settings — React is the head; core is headless under {@link CORE_ENGINE_DIR}. */

import { isTauriRuntime } from './isTauri'

/** Embedded engine tree relative to workspace (submodule / translocated body). */
/**
 * Directory containing `scripts/vision_serve.py` (repo root `.` after engine split).
 * Cecli agent code lives in submodule `cecli/`; Vision HTTP in `bright_vision_core/`.
 */
export const CORE_ENGINE_DIR =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_CORE_ENGINE_DIR) ||
  '.'

export interface VisionConfig {
  model: string
  /**
   * Ollama API URL for LiteLLM (`OLLAMA_API_BASE`). Empty = do not inject; use shell / LiteLLM default.
   */
  ollamaApiBase: string
  /** Optional directory for `local-llm.env` (applied last when reading env). */
  localLlmRoot: string
  /** Desktop: built-in Local LLM (Ollama + preload) before Vision session. */
  manageLocalLlm: boolean
  extraParams: string
  /** Git project the agent edits (any repo; does not need bright-vision-core inside it). */
  workingDir: string
  /** Auto-answer up to N confirmations per session (0 = always prompt). */
  autoApproveLimit: number
  /** When true, disable engine auto-commits (user commits via git). */
  promptBeforeCommit: boolean
  /** Stage edited files after each turn when the engine did not commit (desktop only). */
  autoStageOnDone: boolean
  /** Relative path to core under the AV app install (desktop spawn only). */
  coreEnginePath: string
  pythonPath: string
  /**
   * Core HTTP API. Desktop: filled by Tauri after `start_core_api`.
   * Web: `bright-vision-core-serve` or Vite proxy `/api/core`.
   */
  coreApiUrl: string
  coreApiToken: string
  /** Optional paths (relative to workspace) added to the core session. */
  contextFiles: string[]
  /** Encrypt `.cecli/sessions/` via cecli (desktop: key in OS keychain). */
  sessionEncrypt: boolean
  /** Cecli `--auto-save` for `.cecli/sessions/<autoSaveSessionName>.json`. */
  autoSaveSession: boolean
  /** Cecli `--auto-load` on session start. */
  autoLoadSession: boolean
  /** Basename under `.cecli/sessions/` (default brightvision). */
  autoSaveSessionName: string
  /** Append chat transcript to `.cecli/chat.history`. */
  chatHistoryFile: boolean
}

export const DEFAULT_CONFIG: VisionConfig = {
  model: 'ollama_chat/qwen3.6:27b-q4_K_M',
  ollamaApiBase: '',
  localLlmRoot: '',
  manageLocalLlm: true,
  extraParams: '{"think": false}',
  workingDir: '.',
  autoApproveLimit: 0,
  promptBeforeCommit: false,
  autoStageOnDone: true,
  coreEnginePath: CORE_ENGINE_DIR,
  pythonPath: '',
  coreApiUrl: 'http://127.0.0.1:8741',
  coreApiToken: '',
  contextFiles: [],
  sessionEncrypt: false,
  autoSaveSession: false,
  autoLoadSession: false,
  autoSaveSessionName: 'brightvision',
  chatHistoryFile: true,
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
