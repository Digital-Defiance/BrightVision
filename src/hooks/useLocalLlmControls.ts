import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'
import type { VisionConfig } from '../ipc/config'
import {
  formatLlmPingHint,
  formatLlmPingSummary,
  llmPingAlertSeverity,
  llmPingNeedsSessionStart,
  isOllamaVisionModel,
  resolveLocalLlmForConfig,
  type LlmPingResult,
  type LocalLlmRuntimeStatus,
  type OllamaModelsSnapshot,
} from '../ipc/localLlm'
import { isTauriRuntime } from '../ipc/isTauri'

export function useLocalLlmControls(
  config: VisionConfig,
  onLogLines?: (lines: string[]) => void
) {
  const [status, setStatus] = useState<LocalLlmRuntimeStatus | null>(null)
  const [modelsSnapshot, setModelsSnapshot] = useState<OllamaModelsSnapshot | null>(null)
  const [pingResult, setPingResult] = useState<LlmPingResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { ollamaHost, modelTag } = resolveLocalLlmForConfig(config)
  const ollamaModel = isOllamaVisionModel(config.model)
  const canRun = isTauriRuntime() && Boolean(modelTag) && ollamaModel

  const refresh = useCallback(async () => {
    if (!isTauriRuntime() || !modelTag) {
      setStatus(null)
      setModelsSnapshot(null)
      return
    }
    setError(null)
    try {
      try {
        const keepLogs = await invoke<string[]>('local_llm_refresh_keep_alive', {
          ollamaHost,
          modelTag,
        })
        onLogLines?.(keepLogs.map((l) => `[local-llm] ${l}`))
      } catch {
        // Ollama may be stopped; status fetch below still runs.
      }
      const [s, models] = await Promise.all([
        invoke<LocalLlmRuntimeStatus>('local_llm_status', { ollamaHost, modelTag }),
        invoke<OllamaModelsSnapshot>('ollama_models_snapshot', { ollamaHost, modelTag }),
      ])
      setStatus(s)
      setModelsSnapshot(models)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [ollamaHost, modelTag, onLogLines])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runStart = async () => {
    if (!modelTag) return
    setBusy(true)
    setError(null)
    try {
      const s = await invoke<LocalLlmRuntimeStatus>('local_llm_start_plain', {
        ollamaHost,
        modelTag,
      })
      setStatus(s)
      onLogLines?.(s.logs.map((l) => `[local-llm] ${l}`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      onLogLines?.([`[local-llm] Error: ${msg}`])
    } finally {
      setBusy(false)
    }
  }

  const runPing = async () => {
    if (!modelTag) return
    setBusy(true)
    setError(null)
    setPingResult(null)
    try {
      const r = await invoke<LlmPingResult>('llm_ping', {
        ollamaHost,
        modelTag,
        coreApiUrl: config.coreApiUrl?.trim() || null,
      })
      setPingResult(r)
      onLogLines?.(r.logs.map((l) => `[ping] ${l}`))
      if (!r.generateOk) {
        setError(r.error ?? 'LLM ping failed — see Terminal for details')
      } else if (llmPingNeedsSessionStart(r)) {
        setError(null)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      onLogLines?.([`[ping] Error: ${msg}`])
    } finally {
      setBusy(false)
    }
  }

  const runStop = async (keepOllama: boolean) => {
    if (!modelTag) return
    setBusy(true)
    setError(null)
    try {
      const logs = await invoke<string[]>('local_llm_stop_plain', {
        ollamaHost,
        modelTag,
        keepOllama,
      })
      onLogLines?.(logs.map((l) => `[local-llm] ${l}`))
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const clearPingResult = () => setPingResult(null)
  const clearError = () => setError(null)

  return {
    ollamaHost,
    modelTag,
    ollamaModel,
    canRun,
    status,
    modelsSnapshot,
    pingResult,
    busy,
    error,
    refresh,
    runStart,
    runPing,
    runStop,
    clearPingResult,
    clearError,
    formatLlmPingSummary,
    formatLlmPingHint,
    llmPingAlertSeverity,
  }
}

export type LocalLlmControls = ReturnType<typeof useLocalLlmControls>
