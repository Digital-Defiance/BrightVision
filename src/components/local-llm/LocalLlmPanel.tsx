import MemoryIcon from '@mui/icons-material/Memory'
import NetworkPingIcon from '@mui/icons-material/NetworkPing'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RefreshIcon from '@mui/icons-material/Refresh'
import StopIcon from '@mui/icons-material/Stop'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'
import type { AiderConfig } from '../../ipc/config'
import {
  formatLlmPingSummary,
  isOllamaVisionModel,
  resolveLocalLlmForConfig,
  type LlmPingResult,
  type LocalLlmRuntimeStatus,
  type OllamaModelsSnapshot,
} from '../../ipc/localLlm'
import { isTauriRuntime } from '../../ipc/isTauri'

interface LocalLlmPanelProps {
  config: AiderConfig
  onManageChange: (manage: boolean) => void
  onLogLines?: (lines: string[]) => void
  compact?: boolean
}

function statusChip(ok: boolean, yes: string, no: string) {
  return (
    <Chip
      size="small"
      label={ok ? yes : no}
      color={ok ? 'success' : 'default'}
      variant={ok ? 'filled' : 'outlined'}
    />
  )
}

export function LocalLlmPanel({
  config,
  onManageChange,
  onLogLines,
  compact = false,
}: LocalLlmPanelProps) {
  const [status, setStatus] = useState<LocalLlmRuntimeStatus | null>(null)
  const [modelsSnapshot, setModelsSnapshot] = useState<OllamaModelsSnapshot | null>(null)
  const [pingResult, setPingResult] = useState<LlmPingResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { ollamaHost, modelTag } = resolveLocalLlmForConfig(config)
  const ollamaModel = isOllamaVisionModel(config.model)

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

  if (!isTauriRuntime()) {
    return (
      <Alert severity="info" sx={{ mb: compact ? 0 : 2 }}>
        Local LLM management is built into the desktop app. On web, start Ollama and
        preload your model manually, then match Settings to <code>ollama_chat/&lt;tag&gt;</code>.
      </Alert>
    )
  }

  if (!ollamaModel) {
    return (
      <Alert severity="info" sx={{ mb: compact ? 0 : 2 }}>
        LLM model is not an Ollama provider (<code>ollama_chat/…</code>). Local LLM controls apply
        when using a local Ollama model.
      </Alert>
    )
  }

  if (!modelTag) {
    return null
  }

  return (
    <Paper variant="outlined" sx={{ p: compact ? 1.5 : 2, mb: compact ? 0 : 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <MemoryIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight={700}>
            Local LLM
          </Typography>
          <Chip size="small" label="built-in" variant="outlined" color="primary" />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Starts Ollama if needed, pulls your tag, and preloads with{' '}
          <code>keep_alive: -1</code>. Host and model tag come from <code>local-llm.env</code> and
          Settings.
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
          {statusChip(status?.ollamaRunning ?? false, 'Ollama up', 'Ollama down')}
          {statusChip(status?.modelPulled ?? false, 'Pulled', 'Not pulled')}
          {statusChip(
            modelsSnapshot?.configuredInPs ?? status?.modelLoaded ?? false,
            'In /api/ps',
            'Not in /api/ps'
          )}
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {modelTag} @ {ollamaHost}
          </Typography>
        </Stack>
        {modelsSnapshot && (
          <Paper
            variant="outlined"
            data-testid="ollama-models-snapshot"
            sx={{ p: 1.25, bgcolor: 'action.hover' }}
          >
            <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
              Ollama models (Settings tag: {modelsSnapshot.configuredTag})
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              component="pre"
              sx={{
                m: 0,
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {`/api/tags (pulled)\n${modelsSnapshot.tagsText}\n\n/api/ps (loaded in RAM)\n${modelsSnapshot.psText}`}
            </Typography>
          </Paper>
        )}
        <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
            disabled={busy}
            data-testid="local-llm-start"
            onClick={() => void runStart()}
          >
            Start Local LLM
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<StopIcon />}
            disabled={busy}
            data-testid="local-llm-stop"
            onClick={() => void runStop(true)}
          >
            Unload model
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<NetworkPingIcon />}
            disabled={busy}
            data-testid="local-llm-ping"
            onClick={() => void runPing()}
          >
            Ping LLM
          </Button>
          <Button
            size="small"
            variant="text"
            startIcon={<RefreshIcon />}
            disabled={busy}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
          <Box sx={{ flex: 1 }} />
          <Chip
            size="small"
            label={config.manageLocalLlm ? 'Auto before session' : 'Manual only'}
            color={config.manageLocalLlm ? 'primary' : 'default'}
            onClick={() => onManageChange(!config.manageLocalLlm)}
            sx={{ cursor: 'pointer' }}
          />
        </Stack>
        {pingResult && (
          <Alert
            severity={pingResult.generateOk ? 'success' : 'warning'}
            data-testid="local-llm-ping-result"
            onClose={() => setPingResult(null)}
          >
            {formatLlmPingSummary(pingResult)}
            {pingResult.responsePreview && (
              <Typography
                component="span"
                variant="caption"
                display="block"
                sx={{ mt: 0.5, fontFamily: 'monospace' }}
              >
                Response: {pingResult.responsePreview}
              </Typography>
            )}
          </Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Stack>
    </Paper>
  )
}
