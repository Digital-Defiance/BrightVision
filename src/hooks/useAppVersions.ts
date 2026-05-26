import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { useCallback, useEffect, useState } from 'react'
import packageJson from '../../package.json'
import type { CoreHttpClient } from '../ipc/httpClient'
import { isTauriRuntime } from '../ipc/isTauri'

export interface AppVersions {
  /** Installed app / DMG version (Tauri bundle). */
  app: string | null
  /** bright-vision-core Python package (from core /health). */
  brightVisionCore: string | null
  /** cecli engine package (from core /health). */
  cecli: string | null
  loading: boolean
}

export interface EngineVersionPaths {
  coreEnginePath: string
  pythonPath: string
}

const WEB_DEV_APP_VERSION = packageJson.version

async function loadTauriEngineVersions(paths: EngineVersionPaths): Promise<{
  bright_vision_core: string
  cecli: string
} | null> {
  if (!isTauriRuntime()) return null
  try {
    return await invoke<{ bright_vision_core: string; cecli: string }>('query_engine_versions', {
      coreEnginePath: paths.coreEnginePath,
      pythonPath: paths.pythonPath,
    })
  } catch {
    return null
  }
}

export function useAppVersions(
  coreClient: CoreHttpClient | null,
  options?: {
    enginePaths?: EngineVersionPaths
    /** Extra deps that should trigger a version refresh (e.g. session started). */
    refreshDeps?: readonly unknown[]
  }
): AppVersions & { refresh: () => void } {
  const [app, setApp] = useState<string | null>(null)
  const [brightVisionCore, setBrightVisionCore] = useState<string | null>(null)
  const [cecli, setCecli] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (isTauriRuntime()) {
        try {
          setApp(await getVersion())
        } catch {
          setApp(WEB_DEV_APP_VERSION)
        }
      } else {
        setApp(WEB_DEV_APP_VERSION)
      }

      let coreVer: string | null = null
      let cecliVer: string | null = null

      if (coreClient) {
        try {
          const health = await coreClient.health()
          coreVer = health.versions?.bright_vision_core ?? null
          cecliVer = health.versions?.cecli ?? null
        } catch {
          /* core API not up yet */
        }
      }

      if ((!coreVer || !cecliVer) && options?.enginePaths) {
        const local = await loadTauriEngineVersions(options.enginePaths)
        if (local) {
          if (!coreVer) coreVer = local.bright_vision_core
          if (!cecliVer) cecliVer = local.cecli
        }
      }

      setBrightVisionCore(coreVer)
      setCecli(cecliVer)
    } finally {
      setLoading(false)
    }
  }, [coreClient, options?.enginePaths?.coreEnginePath, options?.enginePaths?.pythonPath])

  useEffect(() => {
    void refresh()
  }, [refresh, ...(options?.refreshDeps ?? [])])

  return {
    app,
    brightVisionCore,
    cecli,
    loading,
    refresh,
  }
}
