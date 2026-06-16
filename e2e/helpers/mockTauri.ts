import type { Page } from '@playwright/test'
import type { TodoStore } from '../../src/todos/types'
import {
  E2E_COMMIT_DETAIL,
  E2E_GIT_COMMITS,
  E2E_GIT_DIFF,
  E2E_GIT_GRAPH,
  E2E_GIT_STATUS,
  E2E_PATH_SUGGESTIONS,
} from './tauriFixtures'
import { emptyTodoStore } from './fixtures'

const emptyTodosJson = (): TodoStore => emptyTodoStore()

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
    write_timing_stats_csv: async () => {
      log.commands.push('write_timing_stats_csv')
      return null
    },
    list_workspace_files_cmd: async () => {
      log.commands.push('list_workspace_files_cmd')
      return ['src/App.tsx', 'src/components/chat/ChatPanel.tsx', 'README.md']
    },
    read_workspace_text_file: async (args) => {
      log.commands.push('read_workspace_text_file')
      const path = String((args as { path?: string }).path ?? '')
      return `// mock content for ${path}\n`
    },
    write_workspace_text_file: async () => {
      log.commands.push('write_workspace_text_file')
      return null
    },
    stop_core_api: async () => null,
    cancel_vision_message: async () => null,
    engine_install_info: async () => ({
      install_root: process.cwd(),
      default_python_path: process.platform === 'win32' ? 'python' : '/usr/bin/python3',
    }),
    git_restore_worktree_paths: async () => {
      log.commands.push('git_restore_worktree_paths')
      return null
    },
    /** Match {@link E2E_CONFIG.coreApiUrl} so Playwright routes in mockCoreApi intercept fetches. */
    start_core_api: async () => '/api/core',
    read_local_llm_config: async () => ({
      sources: ['mock/local-llm.env'],
      ollamaHost: 'http://127.0.0.1:11434',
      dataModel: 'test/model',
      llmMode: null,
      fastModel: null,
      codeModel: null,
      heavyModel: null,
      thinkModel: null,
      modelRouter: null,
      fastThink: null,
      codeThink: null,
      repoLocalLlmRoot: null,
      tierSlots: [],
      priorityList: [],
      modelPriorityRaw: null,
      warnings: [],
      preferWarm: null,
      backend: 'ollama',
    }),
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
    local_llm_prepare_hopper: async () => ['mock: hopper prepared'],
    ollama_ensure_model_loaded: async () => ({
      logs: ['mock: model loaded'],
      load_ms: 42,
      swapped: false,
    }),
    ollama_models_snapshot: async () => ({
      ollamaHost: 'http://127.0.0.1:11434',
      reachable: true,
      configuredTag: 'test/model',
      configuredInPs: true,
      tagsText: '  • test/model (4.0 GB)',
      psText: '  • test/model [VRAM 2.0 GB]',
      psRows: [
        {
          name: 'test/model',
          size: null,
          vram: 'VRAM 2.0 GB',
          expiresAt: '2026-05-25T20:00:00Z',
        },
      ],
      tagsRows: [{ name: 'test/model', size: '4.0 GB', vram: null, expiresAt: null }],
      backend: 'ollama',
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
    ntfy_send_push: async () => null,
    read_workspace_todos: async () => emptyTodosJson(),
    write_workspace_todos: async () => null,
    export_todo_spec_files: async () => null,
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
    async function parseSseStream(
      response: Response,
      channel: { onmessage?: (event: unknown) => void }
    ) {
      const reader = response.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6)) as unknown
              channel.onmessage?.(event)
            } catch {
              /* ignore malformed chunk */
            }
          }
        }
      }
    }

    const invoke = async (
      cmd: string,
      args: Record<string, unknown> = {},
      _options?: unknown
    ) => {
      const bridge = window as unknown as {
        __e2eTauriInvoke: typeof invoke
      }
      if (cmd === 'create_vision_session') {
        const baseUrl = String(args.baseUrl ?? '/api/core').replace(/\/$/, '')
        const res = await fetch(`${baseUrl}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args.body ?? {}),
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`POST /sessions ${res.status}: ${text}`)
        }
        return res.json()
      }
      if (cmd === 'vision_api_fetch') {
        const baseUrl = String(args.baseUrl ?? '/api/core').replace(/\/$/, '')
        const path = String(args.path ?? '').replace(/^\//, '')
        const method = String(args.method ?? 'GET').toUpperCase()
        const headers: Record<string, string> = {}
        if (args.body != null) headers['Content-Type'] = 'application/json'
        const token = args.bearerToken
        if (typeof token === 'string' && token.trim()) {
          headers.Authorization = `Bearer ${token.trim()}`
        }
        const res = await fetch(`${baseUrl}/${path}`, {
          method,
          headers,
          body: args.body != null ? JSON.stringify(args.body) : undefined,
        })
        const text = await res.text()
        let body: unknown = text
        try {
          body = JSON.parse(text) as unknown
        } catch {
          /* plain text */
        }
        return { status: res.status, body }
      }
      if (cmd === 'send_vision_message') {
        const baseUrl = String(args.baseUrl ?? '/api/core').replace(/\/$/, '')
        const sessionId = String(args.sessionId ?? '')
        const channel = args.onEvent as { onmessage?: (event: unknown) => void }
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        const token = args.bearerToken
        if (typeof token === 'string' && token.trim()) {
          headers.Authorization = `Bearer ${token.trim()}`
        }
        const res = await fetch(`${baseUrl}/sessions/${sessionId}/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify(args.body ?? {}),
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`POST /messages ${res.status}: ${text}`)
        }
        await parseSseStream(res, channel)
        return
      }
      if (cmd === 'cancel_vision_message') {
        return null
      }
      return bridge.__e2eTauriInvoke(cmd, args)
    }

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
