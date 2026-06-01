import { useCallback, useEffect, useState } from 'react'
import type { VisionConfig } from '../ipc/config'
import { CoreHttpClient } from '../ipc/httpClient'
import { waitForVisionApi } from '../ipc/health'
import { isTauriRuntime } from '../ipc/isTauri'
import {
  spawnDesktopVisionApi,
  stopDesktopVisionApi,
  VISION_API_DEFAULT_PORT,
  visionApiBaseUrl,
} from '../ipc/visionApiSpawn'

export interface VisionApiControlsOptions {
  onLogLines?: (lines: string[]) => void
  onApiUrl?: (url: string) => void
  /** When true, Stop is blocked (use Terminal → Stop for full session teardown). */
  sessionActive?: boolean
}

export function useVisionApiControls(
  config: VisionConfig,
  options: VisionApiControlsOptions = {}
) {
  const { onLogLines, onApiUrl, sessionActive = false } = options
  const [apiReachable, setApiReachable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canRun = isTauriRuntime()
  const baseUrl = visionApiBaseUrl(config)

  const probe = useCallback(async () => {
    if (!canRun) {
      setApiReachable(null)
      return
    }
    try {
      const client = new CoreHttpClient(baseUrl, config.coreApiToken || undefined)
      await client.health()
      setApiReachable(true)
    } catch {
      setApiReachable(false)
    }
  }, [baseUrl, canRun, config.coreApiToken])

  useEffect(() => {
    void probe()
  }, [probe])

  const runStart = async () => {
    if (!canRun) return
    if (!config.workingDir?.trim()) {
      setError('Set a project workspace before starting the Vision API.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onLogLines?.([`[vision-api] Spawning on :${VISION_API_DEFAULT_PORT}…`])
      const url = await spawnDesktopVisionApi(config)
      onApiUrl?.(url)
      const client = new CoreHttpClient(url, config.coreApiToken || undefined)
      await waitForVisionApi(client)
      setApiReachable(true)
      onLogLines?.([`[vision-api] OK ${url}`])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      onLogLines?.([`[vision-api] Error: ${msg}`])
      await probe()
    } finally {
      setBusy(false)
    }
  }

  const runStop = async () => {
    if (!canRun) return
    if (sessionActive) {
      setError('Stop the coding session from Terminal → Stop first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await stopDesktopVisionApi()
      setApiReachable(false)
      onLogLines?.(['[vision-api] Stopped'])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      onLogLines?.([`[vision-api] Error: ${msg}`])
    } finally {
      setBusy(false)
      await probe()
    }
  }

  const clearError = () => setError(null)

  return {
    canRun,
    baseUrl,
    apiReachable,
    busy,
    error,
    probe,
    runStart,
    runStop,
    clearError,
  }
}

export type VisionApiControls = ReturnType<typeof useVisionApiControls>
