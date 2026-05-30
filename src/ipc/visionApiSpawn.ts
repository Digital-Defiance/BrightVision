import type { VisionConfig } from './config'
import { invokeWithTimeout } from './tauriInvoke'
import { isTauriRuntime } from './isTauri'

export const VISION_API_DEFAULT_PORT = 8741

export function visionApiBaseUrl(config: VisionConfig): string {
  const trimmed = config.coreApiUrl?.trim()
  if (trimmed) return trimmed.replace(/\/$/, '')
  return `http://127.0.0.1:${VISION_API_DEFAULT_PORT}`
}

/** Spawn `bright-vision-core-serve` via Tauri (idempotent if already running). */
export async function spawnDesktopVisionApi(cfg: VisionConfig): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Vision API spawn is only available in the desktop app')
  }
  if (cfg.sessionEncrypt) {
    await invokeWithTimeout<string>('ensure_session_encryption_key', {})
  }
  return invokeWithTimeout<string>(
    'start_core_api',
    {
      workingDir: cfg.workingDir,
      coreEnginePath: cfg.coreEnginePath,
      pythonPath: cfg.pythonPath,
      extraParams: cfg.extraParams,
      ollamaApiBase: cfg.ollamaApiBase,
      port: VISION_API_DEFAULT_PORT,
      sessionEncrypt: cfg.sessionEncrypt,
      apiToken: cfg.coreApiToken?.trim() || null,
    },
    90_000
  )
}

export async function stopDesktopVisionApi(): Promise<void> {
  if (!isTauriRuntime()) return
  await invokeWithTimeout('stop_core_api', {}, 30_000)
}
