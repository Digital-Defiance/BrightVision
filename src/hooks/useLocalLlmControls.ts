import { useCallback, useEffect, useRef, useState } from 'react'
import type { VisionConfig } from '../ipc/config'
import {
  capabilitiesForBackend,
  formatLlmPingHint,
  formatLlmPingSummary,
  llmPingAlertSeverity,
  llmPingNeedsSessionStart,
  isOllamaVisionModel,
  resolveLocalLlmForConfig,
  type BackendCapabilities,
  type LlmPingResult,
  type LocalLlmRuntimeStatus,
  type LocalLlmSnapshot,
  type OllamaModelsSnapshot,
} from '../ipc/localLlm'
import { isTauriRuntime } from '../ipc/isTauri'
import { invokeWithTimeout } from './invokeWithTimeout'

export function useLocalLlmControls(
  config: VisionConfig,
  onLogLines?: (lines: string[]) => void
) {
  const [status, setStatus] = useState<LocalLlmRuntimeStatus | null>(null)
  const [modelsSnapshot, setModelsSnapshot] = useState<OllamaModelsSnapshot | null>(null)
  const [pingResult, setPingResult] = useState<LlmPingResult | null>(null)
  const [backendSnapshot, setBackendSnapshot] = useState<LocalLlmSnapshot | null>(null)
  const [backendUnavailable, setBackendUnavailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevBackendRef = useRef<string | undefined>(undefined)

  const { ollamaHost, modelTag } = resolveLocalLlmForConfig(config)
  const ollamaModel = isOllamaVisionModel(config.model)
  const backend = backendSnapshot?.backend ?? 'ollama'
  const capabilities: BackendCapabilities = capabilitiesForBackend(backend)
  const canRun =
    isTauriRuntime() &&
    Boolean(modelTag) &&
    ollamaModel &&
    !backendUnavailable

  const resetRuntimeState = useCallback(() => {
    setStatus(null)
    setModelsSnapshot(null)
    setPingResult(null)
    setError(null)
  }, [])

  const loadBackendConfig = useCallback(async () => {
    if (!isTauriRuntime()) {
      setBackendSnapshot(null)
      setBackendUnavailable(false)
      return
    }
    try {
      const snap = await invokeWithTimeout<LocalLlmSnapshot>('read_local_llm_config', {
        localLlmRoot: config.localLlmRoot.trim() || null,
      })
      setBackendSnapshot(snap)
      setBackendUnavailable(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('IPC timeout')) {
        setBackendUnavailable(true)
        setBackendSnapshot(null)
      }
    }
  }, [config.localLlmRoot])

  useEffect(() => {
    void loadBackendConfig()
  }, [loadBackendConfig])

  useEffect(() => {
    const nextBackend = backendSnapshot?.backend ?? 'ollama'
    if (
      prevBackendRef.current !== undefined &&
      prevBackendRef.current !== nextBackend
    ) {
      resetRuntimeState()
    }
    prevBackendRef.current = nextBackend
  }, [backendSnapshot?.backend, resetRuntimeState])

  const refresh = useCallback(async () => {
    if (!isTauriRuntime() || !modelTag || backendUnavailable) {
      if (!backendUnavailable) {
        resetRuntimeState()
      }
      return
    }
    setError(null)
    try {
      if (capabilities.supportsModelPull) {
        try {
          const keepLogs = await invokeWithTimeout<string[]>('local_llm_refresh_keep_alive', {
            ollamaHost,
            modelTag,
          })
          onLogLines?.(keepLogs.map((l) => `[local-llm] ${l}`))
        } catch {
          // Ollama may be stopped; status fetch below still runs.
        }
      }
      const [s, models] = await Promise.all([
        invokeWithTimeout<LocalLlmRuntimeStatus>('local_llm_status', { ollamaHost, modelTag }),
        invokeWithTimeout<OllamaModelsSnapshot>('ollama_models_snapshot', {
          ollamaHost,
          modelTag,
        }),
      ])
      setStatus(s)
      setModelsSnapshot(models)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('IPC timeout')) {
        setBackendUnavailable(true)
        resetRuntimeState()
      } else {
        setError(msg)
      }
    }
  }, [
    backendUnavailable,
    capabilities.supportsModelPull,
    modelTag,
    ollamaHost,
    onLogLines,
    resetRuntimeState,
  ])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runStart = async () => {
    if (!modelTag || !capabilities.supportsModelPull) return
    setBusy(true)
    setError(null)
    try {
      const s = await invokeWithTimeout<LocalLlmRuntimeStatus>('local_llm_start_plain', {
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
      const r = await invokeWithTimeout<LlmPingResult>('llm_ping', {
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
      const logs = await invokeWithTimeout<string[]>('local_llm_stop_plain', {
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
    backend,
    backendSnapshot,
    capabilities,
    backendUnavailable,
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
