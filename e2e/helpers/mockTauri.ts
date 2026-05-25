import type { Page } from '@playwright/test'
import {
  E2E_COMMIT_DETAIL,
  E2E_GIT_COMMITS,
  E2E_GIT_DIFF,
  E2E_GIT_GRAPH,
  E2E_GIT_STATUS,
  E2E_PATH_SUGGESTIONS,
} from './tauriFixtures'

export type TauriHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>

export interface MockTauriOptions {
  handlers?: Partial<Record<string, TauriHandler>>
}

/** Tracks invoke calls from the page (for git poll / attach tests). */
export interface TauriInvokeLog {
  commands: string[]
}

function defaultHandlers(log: TauriInvokeLog): Record<string, TauriHandler> {
  let gitStatus = structuredClone(E2E_GIT_STATUS)

  return {
    git_workspace_status: () => {
      log.commands.push('git_workspace_status')
      return gitStatus
    },
    git_file_diff: () => E2E_GIT_DIFF,
    git_recent_commits: () => E2E_GIT_COMMITS,
    git_commit_graph: () => E2E_GIT_GRAPH,
    git_commit_detail: () => E2E_COMMIT_DETAIL,
    git_stage_paths: (args) => {
      log.commands.push('git_stage_paths')
      const paths = (args as { paths?: string[] | null }).paths
      if (!paths?.length) {
        gitStatus = {
          ...gitStatus,
          files: gitStatus.files.map((f) => ({ ...f, index: 'M', worktree: ' ' })),
        }
      }
      return null
    },
    complete_workspace_path: (args) => {
      log.commands.push('complete_workspace_path')
      const prefix = String((args as { prefix?: string }).prefix ?? '').toLowerCase()
      return E2E_PATH_SUGGESTIONS.filter((p) => p.toLowerCase().startsWith(prefix))
    },
    pick_workspace_folder: async () => null,
    pick_and_stage_chat_images: async () => {
      log.commands.push('pick_and_stage_chat_images')
      return ['docs/diagram.png']
    },
    pick_context_directory: async () => null,
    estimate_paths_context_chars: async () => 8000,
    detect_workspace: async () => '.',
    stop_core_api: async () => null,
    /** Match {@link E2E_CONFIG.coreApiUrl} so Playwright routes in mockCoreApi intercept fetches. */
    start_core_api: async () => '/api/core',
    local_llm_refresh_keep_alive: async () => ['test/model: keep_alive=-1 refreshed'],
    local_llm_status: async () => ({
      ollamaRunning: true,
      modelPulled: true,
      modelLoaded: true,
      ollamaHost: 'http://127.0.0.1:11434',
      modelTag: 'test/model',
      logs: [],
    }),
    local_llm_start_plain: async () => ({
      ollamaRunning: true,
      modelPulled: true,
      modelLoaded: true,
      ollamaHost: 'http://127.0.0.1:11434',
      modelTag: 'test/model',
      logs: ['mock start'],
    }),
    local_llm_stop_plain: async () => ['mock stop'],
    ollama_models_snapshot: async () => ({
      ollamaHost: 'http://127.0.0.1:11434',
      reachable: true,
      configuredTag: 'test/model',
      configuredInPs: true,
      tagsText: '  • test/model (4.0 GB)',
      psText: '  • test/model [VRAM 2.0 GB]',
    }),
    get_resource_snapshot: async () => ({
      cpuPct: 12.5,
      memUsedMb: 8192,
      memTotalMb: 16384,
      memPct: 50,
      gpuPct: 8,
      gpuSource: 'nvidia-smi',
      scope: 'system',
    }),
    llm_ping: async () => ({
      ollamaReachable: true,
      modelPulled: true,
      modelLoaded: true,
      generateOk: true,
      latencyMs: 42,
      responsePreview: 'p',
      coreReachable: true,
      coreLatencyMs: 5,
      error: null,
      logs: ['Ping mock/model @ http://127.0.0.1:11434', 'Generate OK in 42ms'],
    }),
  }
}

/**
 * Inject a minimal Tauri 2 bridge so `isTauriRuntime()` is true and `invoke()` is mocked.
 * Call before `page.goto()`.
 */
export async function installMockTauri(page: Page, opts: MockTauriOptions = {}) {
  const log: TauriInvokeLog = { commands: [] }
  const handlers = { ...defaultHandlers(log), ...opts.handlers }

  await page.exposeFunction('__e2eTauriInvoke', async (cmd: string, args: Record<string, unknown>) => {
    const fn = handlers[cmd]
    if (!fn) {
      throw new Error(`unknown tauri command: ${cmd}`)
    }
    return fn(args)
  })

  await page.addInitScript(() => {
    const invoke = async (
      cmd: string,
      args: Record<string, unknown> = {},
      _options?: unknown
    ) => (window as unknown as { __e2eTauriInvoke: typeof invoke }).__e2eTauriInvoke(cmd, args)

    const internals = {
      invoke,
      transformCallback: (_cb?: unknown, _once?: boolean) => 0,
      registerCallback: () => {},
      runCallback: () => {},
      unregisterCallback: () => {},
      convertFileSrc: (path: string) => path,
    }
    ;(window as unknown as { __TAURI_INTERNALS__: typeof internals }).__TAURI_INTERNALS__ =
      internals
    ;(window as unknown as { __TAURI__: { invoke: typeof invoke } }).__TAURI__ = { invoke }
    ;(globalThis as unknown as { isTauri: boolean }).isTauri = true
  })

  return {
    getLog: () => log,
    resetLog: () => {
      log.commands.length = 0
    },
  }
}
