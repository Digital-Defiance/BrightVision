import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(E2E_DIR, '../..')
const EXTERNAL_FIXTURE_PACK_ROOT = process.env.E2E_FIXTURE_PACK_ROOT?.trim() || ''
const SUBMODULE_FIXTURE_PACK_ROOT = path.join(REPO_ROOT, 'e2e/fixture-pack')
const INREPO_FIXTURE_PACK_ROOT = path.join(REPO_ROOT, 'e2e/fixtures')

export function resolveFixturePackRoot(): string {
  if (EXTERNAL_FIXTURE_PACK_ROOT) return EXTERNAL_FIXTURE_PACK_ROOT
  if (fs.existsSync(SUBMODULE_FIXTURE_PACK_ROOT)) return SUBMODULE_FIXTURE_PACK_ROOT
  return INREPO_FIXTURE_PACK_ROOT
}

function fixtureWorkspaceRoot(name: string): string {
  return path.join(resolveFixturePackRoot(), name)
}

/** Minimal git repo — same idea as `tests/core/test_hello_llm.py` (GitTemporaryDirectory). */
export const LLM_E2E_WORKSPACE = fixtureWorkspaceRoot('hello-workspace')

const CORE_API_URL = 'http://127.0.0.1:8741'
const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434'

/** Fast local default for `yarn test:llm:core` / `yarn test:e2e:llm` (also set in package.json). */
export const DEFAULT_E2E_OLLAMA_MODEL = 'ollama_chat/llama3.2:3b'

export function isLlmE2eEnabled(): boolean {
  return process.env.E2E_LLM === '1'
}

export function isRouterLlmE2eEnabled(): boolean {
  const v = process.env.E2E_MODEL_ROUTER?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

/** Opt-in: use BrightVision repo root as workspace (slow repo map on session start). */
export function isSuperprojectLlmEnabled(): boolean {
  const v = process.env.E2E_SUPERPROJECT_LLM?.trim().toLowerCase()
  return (
    isLlmE2eEnabled() && (v === '1' || v === 'true' || v === 'yes' || v === 'on')
  )
}

export const SUPERPROJECT_README_HEADING = 'bright_vision_core'

export function superprojectLlmWorkspace(): string {
  return REPO_ROOT
}

export function superprojectLlmReadmeRel(): string {
  return 'bright_vision_core/README.md'
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function loadLocalLlmEnv(): Record<string, string> {
  const paths = [
    path.join(REPO_ROOT, 'local-llm.env'),
    path.join(REPO_ROOT, 'local-llm', 'local-llm.env'),
    path.join(process.env.HOME ?? '', 'local-llm', 'local-llm.env'),
    path.join(process.env.HOME ?? '', '.config', 'local-llm', 'env'),
  ]
  let merged: Record<string, string> = {}
  for (const p of paths) {
    merged = { ...merged, ...parseEnvFile(p) }
  }
  return merged
}

function normalizeOllamaTag(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  if (v.startsWith('ollama_chat/')) return v.slice('ollama_chat/'.length)
  if (v.startsWith('ollama/')) return v.slice('ollama/'.length)
  return v
}

export function resolveRouterModelTags(): { fastTag: string; heavyTag: string } {
  const envFile = loadLocalLlmEnv()
  const fastTag = normalizeOllamaTag(
    process.env.E2E_FAST_MODEL?.trim() ||
      process.env.FAST_MODEL?.trim() ||
      envFile.FAST_MODEL?.trim() ||
      ''
  )
  const heavyTag = normalizeOllamaTag(
    process.env.E2E_HEAVY_MODEL?.trim() ||
      process.env.HEAVY_MODEL?.trim() ||
      envFile.HEAVY_MODEL?.trim() ||
      process.env.E2E_OLLAMA_MODEL?.trim() ||
      resolveOllamaTag()
  )
  return { fastTag, heavyTag }
}

export function buildRouterPrefsForStorage():
  | {
      enabled: true
      models: { tier: 'fast' | 'heavy'; model: string; enabled: boolean; label: string }[]
      tokenFastMax: number
      tokenHeavyMin: number
      keepAliveFastSec: number
      keepAliveHeavySec: number
      escalateOnFailure: boolean
    }
  | null {
  if (!isRouterLlmE2eEnabled()) return null
  const { fastTag, heavyTag } = resolveRouterModelTags()
  if (!fastTag) return null
  return {
    enabled: true,
    models: [
      {
        tier: 'fast',
        model: visionModelFromTag(fastTag),
        enabled: true,
        label: `E2E FAST_MODEL: ${fastTag}`,
      },
      {
        tier: 'heavy',
        model: visionModelFromTag(heavyTag || fastTag),
        enabled: true,
        label: `E2E HEAVY_MODEL: ${heavyTag || fastTag}`,
      },
    ],
    tokenFastMax: Number(process.env.E2E_ROUTER_TOKEN_FAST_MAX || 4096),
    tokenHeavyMin: Number(process.env.E2E_ROUTER_TOKEN_HEAVY_MIN || 12000),
    keepAliveFastSec: 300,
    keepAliveHeavySec: 0,
    escalateOnFailure: true,
  }
}

export function resolveOllamaHost(): string {
  const fromEnv =
    process.env.E2E_OLLAMA_HOST?.trim() ||
    process.env.OLLAMA_HOST?.trim() ||
    loadLocalLlmEnv().OLLAMA_HOST?.trim()
  return fromEnv || DEFAULT_OLLAMA_HOST
}

/** Ollama tag without the `ollama_chat/` prefix. */
export function resolveOllamaTag(): string {
  const explicit = process.env.E2E_OLLAMA_MODEL?.trim()
  if (explicit) {
    if (explicit.startsWith('ollama_chat/')) return explicit.slice('ollama_chat/'.length)
    if (explicit.startsWith('ollama/')) return explicit.slice('ollama/'.length)
    return explicit
  }
  const fromFile =
    loadLocalLlmEnv().DATA_MODEL?.trim() ||
    loadLocalLlmEnv().LLM_MODEL?.trim() ||
    loadLocalLlmEnv().CHAT_MODEL?.trim()
  if (fromFile) {
    if (fromFile.startsWith('ollama_chat/')) return fromFile.slice('ollama_chat/'.length)
    if (fromFile.startsWith('ollama/')) return fromFile.slice('ollama/'.length)
    return fromFile
  }
  return ''
}

/** Bare Ollama tag for DEFAULT_E2E_OLLAMA_MODEL (`llama3.2:3b`). */
export function defaultE2eOllamaTag(): string {
  const m = DEFAULT_E2E_OLLAMA_MODEL.trim()
  if (m.startsWith('ollama_chat/')) return m.slice('ollama_chat/'.length)
  if (m.startsWith('ollama/')) return m.slice('ollama/'.length)
  return m
}

export function isOllamaAutoPullEnabled(): boolean {
  const v = process.env.E2E_OLLAMA_AUTO_PULL?.trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'no'
}

export async function fetchOllamaTagNames(host = resolveOllamaHost()): Promise<string[]> {
  const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Ollama /api/tags: HTTP ${res.status}`)
  const body = (await res.json()) as { models?: { name?: string; model?: string }[] }
  const names: string[] = []
  for (const entry of body.models ?? []) {
    for (const key of ['name', 'model'] as const) {
      const val = entry[key]
      if (typeof val === 'string' && val) names.push(val)
    }
  }
  return names
}

export function isTagPulled(names: string[], tag: string): boolean {
  return names.some((n) => n === tag || n.startsWith(`${tag}:`))
}

export function ollamaPullModel(tag: string): void {
  // eslint-disable-next-line no-console
  console.log(`[llm e2e] ollama pull ${tag}…`)
  execSync(`ollama pull ${tag}`, { stdio: 'inherit', env: process.env })
}

/** Pull when missing; set E2E_OLLAMA_AUTO_PULL=0 to fail fast without downloading. */
export async function ensureOllamaModelPulled(tag?: string): Promise<string> {
  const resolved = tag ?? (await resolveOllamaTagWithFallback())
  const host = resolveOllamaHost()
  let names = await fetchOllamaTagNames(host)
  if (isTagPulled(names, resolved)) return resolved

  if (!isOllamaAutoPullEnabled()) {
    throw new Error(
      `Model "${resolved}" is not pulled. Run: ollama pull ${resolved}\n` +
        'Or leave E2E_OLLAMA_AUTO_PULL enabled (default) to pull automatically.'
    )
  }

  ollamaPullModel(resolved)
  names = await fetchOllamaTagNames(host)
  if (!isTagPulled(names, resolved)) {
    throw new Error(`ollama pull ${resolved} finished but model still missing from /api/tags`)
  }
  return resolved
}

export async function resolveOllamaTagWithFallback(): Promise<string> {
  const configured = resolveOllamaTag()
  if (configured) return configured
  return defaultE2eOllamaTag()
}

const LITELLM_PROVIDER_PREFIXES = [
  'openai/',
  'anthropic/',
  'azure/',
  'gemini/',
  'cohere/',
  'groq/',
  'deepseek/',
  'openrouter/',
  'mistral/',
  'xai/',
] as const

export function isProviderVisionModel(model: string): boolean {
  const m = model.trim().toLowerCase()
  return LITELLM_PROVIDER_PREFIXES.some((p) => m.startsWith(p))
}

export function visionModelFromTag(tag: string): string {
  const m = tag.trim()
  if (!m) return m
  if (isProviderVisionModel(m) || m.startsWith('ollama_chat/') || m.startsWith('ollama/')) {
    return m
  }
  return `ollama_chat/${m}`
}

export function resolveVisionModel(): string {
  const explicit =
    process.env.E2E_VISION_MODEL?.trim() || process.env.E2E_OLLAMA_MODEL?.trim()
  if (explicit) return visionModelFromTag(explicit)
  const tag = resolveOllamaTag()
  if (tag) return visionModelFromTag(tag)
  return ''
}

/** Create/init minimal workspace (committed README; `.git` created on first LLM e2e run). */
export function ensureLlmE2eWorkspace(): string {
  fs.mkdirSync(LLM_E2E_WORKSPACE, { recursive: true })
  const readme = path.join(LLM_E2E_WORKSPACE, 'README.md')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, '# E2E hello workspace\n', 'utf8')
  }
  if (!fs.existsSync(path.join(LLM_E2E_WORKSPACE, '.git'))) {
    execSync(
      'git init -b main && git add README.md && git -c user.email=e2e@test -c user.name=e2e commit -m "e2e init"',
      { cwd: LLM_E2E_WORKSPACE, stdio: 'pipe' }
    )
  }
  return LLM_E2E_WORKSPACE
}

/** Env vars the headless core needs for LiteLLM → Ollama (UI config does not reach the server process). */
export function ollamaEnvForCore(): Record<string, string> {
  const out: Record<string, string> = {}
  const host = resolveOllamaHost()
  if (host) out.OLLAMA_API_BASE = host
  const file = loadLocalLlmEnv()
  if (file.OLLAMA_API_KEY?.trim()) out.OLLAMA_API_KEY = file.OLLAMA_API_KEY.trim()
  if (file.OLLAMA_HOST?.trim() && !out.OLLAMA_API_BASE) {
    out.OLLAMA_API_BASE = file.OLLAMA_HOST.trim()
  }
  return out
}

export function buildLlmE2eConfig() {
  const host = resolveOllamaHost()
  return {
    model: resolveVisionModel(),
    ollamaApiBase: host,
    localLlmRoot: '',
    manageLocalLlm: false,
    extraParams: '{}',
    workingDir: ensureLlmE2eWorkspace(),
    autoApproveLimit: 0,
    promptBeforeCommit: true,
    autoStageOnDone: false,
    coreEnginePath: '.',
    pythonPath: '',
    coreApiUrl: '/api/core',
    coreApiToken: '',
    contextFiles: [] as string[],
  }
}

export async function assertOllamaForLlmE2e(): Promise<void> {
  const host = resolveOllamaHost()
  try {
    await fetchOllamaTagNames(host)
  } catch (err) {
    throw new Error(
      `Ollama not reachable at ${host} (${err}). Install Ollama and run: ollama serve`
    )
  }
  await ensureOllamaModelPulled()
}

export function coreHealthUrl(): string {
  return `${CORE_API_URL}/health`
}

/** Env for spawning Vision API — must not put repo root on PYTHONPATH (shadows `cecli`). */
export function buildVisionCoreEnv(
  extra: Record<string, string> = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  env.PYTHONSAFEPATH = '1'
  env.BRIGHT_VISION_HEADLESS = '1'
  env.BRIGHT_VISION_HEADLESS = '1'
  delete env.PYTHONPATH
  return env
}
