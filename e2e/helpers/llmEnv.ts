import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
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
const DEFAULT_LMSTUDIO_HOST = 'http://127.0.0.1:1234'

/** Fast local default for `yarn test:llm:core` / `yarn test:e2e:llm` (also set in package.json). */
export const DEFAULT_E2E_OLLAMA_MODEL = 'ollama_chat/llama3.2:3b'
export const DEFAULT_E2E_LMSTUDIO_MODEL = 'openai/llama-3.2-3b-instruct'

export function isLlmE2eEnabled(): boolean {
  return process.env['E2E_LLM'] === '1'
}

export function isRouterLlmE2eEnabled(): boolean {
  const v = process.env['E2E_MODEL_ROUTER']?.trim().toLowerCase()
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
  if (v.startsWith('openai/')) return v.slice('openai/'.length)
  return v
}

export function resolveLocalLlmBackend(): string {
  const fromEnv = process.env.BRIGHTVISION_LLM_BACKEND?.trim()
  if (fromEnv) return fromEnv.toLowerCase()
  const fromFile = loadLocalLlmEnv().BRIGHTVISION_LLM_BACKEND?.trim()
  return (fromFile || 'lmstudio').toLowerCase()
}

function defaultE2eModel(): string {
  return resolveLocalLlmBackend() === 'lmstudio'
    ? DEFAULT_E2E_LMSTUDIO_MODEL
    : DEFAULT_E2E_OLLAMA_MODEL
}

export function resolveRouterModelTags(): {
  fastTag: string
  codeTag: string
  thinkTag: string
  /** @deprecated Use `codeTag`. */
  heavyTag: string
} {
  const envFile = loadLocalLlmEnv()
  const fastTag = normalizeOllamaTag(
    process.env.E2E_FAST_MODEL?.trim() ||
      process.env.FAST_MODEL?.trim() ||
      envFile.FAST_MODEL?.trim() ||
      ''
  )
  const codeTag = normalizeOllamaTag(
    process.env.E2E_CODE_MODEL?.trim() ||
      process.env.CODE_MODEL?.trim() ||
      envFile.CODE_MODEL?.trim() ||
      process.env.E2E_HEAVY_MODEL?.trim() ||
      process.env.HEAVY_MODEL?.trim() ||
      envFile.HEAVY_MODEL?.trim() ||
      process.env.E2E_OLLAMA_MODEL?.trim() ||
      resolveOllamaTag()
  )
  const thinkTag = normalizeOllamaTag(
    process.env.E2E_THINK_MODEL?.trim() ||
      process.env.THINK_MODEL?.trim() ||
      envFile.THINK_MODEL?.trim() ||
      ''
  )
  return { fastTag, codeTag, thinkTag, heavyTag: codeTag }
}

export function buildRouterPrefsForStorage():
  | {
      enabled: true
      models: {
        id?: string
        tier: 'fast' | 'code' | 'think' | 'heavy'
        model: string
        enabled: boolean
        label: string
      }[]
      tokenFastMax: number
      tokenHeavyMin: number
      keepAliveFastSec: number
      keepAliveHeavySec: number
      escalateOnFailure: boolean
    }
  | null {
  if (!isRouterLlmE2eEnabled()) return null
  const { fastTag, codeTag, thinkTag } = resolveRouterModelTags()
  if (!fastTag) return null
  const models: {
    id?: string
    tier: 'fast' | 'code' | 'think' | 'heavy'
    model: string
    enabled: boolean
    label: string
  }[] = [
    {
      id: 'e2e-fast',
      tier: 'fast',
      model: visionModelFromTag(fastTag),
      enabled: true,
      label: `E2E FAST_MODEL: ${fastTag}`,
    },
    {
      id: 'e2e-code',
      tier: 'code',
      model: visionModelFromTag(codeTag || fastTag),
      enabled: true,
      label: `E2E CODE_MODEL: ${codeTag || fastTag}`,
    },
  ]
  if (thinkTag) {
    models.push({
      id: 'e2e-think',
      tier: 'think',
      model: visionModelFromTag(thinkTag),
      enabled: true,
      label: `E2E THINK_MODEL: ${thinkTag}`,
    })
  }
  return {
    enabled: true,
    models,
    tokenFastMax: Number(process.env.E2E_ROUTER_TOKEN_FAST_MAX || 4096),
    tokenHeavyMin: Number(process.env.E2E_ROUTER_TOKEN_HEAVY_MIN || 12000),
    keepAliveFastSec: 300,
    keepAliveHeavySec: -1,
    escalateOnFailure: true,
  }
}

export function resolveOllamaHost(): string {
  const file = loadLocalLlmEnv()
  if (resolveLocalLlmBackend() === 'lmstudio') {
    const fromEnv =
      process.env.BRIGHTVISION_LLM_BACKEND_URL?.trim() ||
      process.env.OLLAMA_HOST?.trim() ||
      file.BRIGHTVISION_LLM_BACKEND_URL?.trim() ||
      file.OLLAMA_HOST?.trim()
    return fromEnv || DEFAULT_LMSTUDIO_HOST
  }
  const fromEnv =
    process.env.E2E_OLLAMA_HOST?.trim() ||
    process.env.OLLAMA_HOST?.trim() ||
    file.OLLAMA_HOST?.trim()
  return fromEnv || DEFAULT_OLLAMA_HOST
}

function lmstudioApiBase(): string {
  const file = loadLocalLlmEnv()
  const explicit =
    process.env.OPENAI_API_BASE?.trim() || file.OPENAI_API_BASE?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  return `${resolveOllamaHost().replace(/\/$/, '')}/v1`
}

/** Model tag / modelKey without provider prefix. */
export function resolveOllamaTag(): string {
  const explicit = process.env.E2E_OLLAMA_MODEL?.trim()
  if (explicit) return normalizeOllamaTag(explicit)
  const fromFile =
    loadLocalLlmEnv().DATA_MODEL?.trim() ||
    loadLocalLlmEnv().LLM_MODEL?.trim() ||
    loadLocalLlmEnv().CHAT_MODEL?.trim()
  if (fromFile) return normalizeOllamaTag(fromFile)
  return ''
}

/** Bare tag for suite default model. */
export function defaultE2eOllamaTag(): string {
  return normalizeOllamaTag(defaultE2eModel())
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

export function fetchLmStudioModelKeys(): string[] {
  try {
    const out = execSync('lms ls --json', { encoding: 'utf8', timeout: 20_000 })
    const rows = JSON.parse(out) as unknown
    if (!Array.isArray(rows)) return []
    const keys: string[] = []
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const entry = row as { type?: string; modelKey?: string }
      if (entry.type !== 'llm') continue
      const key = entry.modelKey?.trim()
      if (key) keys.push(key)
    }
    return keys
  } catch {
    return []
  }
}

export function isLmStudioModelOnDisk(keys: string[], tag: string): boolean {
  const bare = normalizeOllamaTag(tag)
  return keys.includes(bare)
}

export async function ensureLmStudioModelAvailable(tag?: string): Promise<string> {
  const resolved = tag?.trim() ? normalizeOllamaTag(tag) : await resolveOllamaTagWithFallback()
  const keys = fetchLmStudioModelKeys()
  if (isLmStudioModelOnDisk(keys, resolved)) return resolved
  const hint = `Download it in LM Studio or run: lms get ${resolved}`
  if (!isOllamaAutoPullEnabled()) {
    throw new Error(`Model "${resolved}" is not installed in LM Studio. ${hint}`)
  }
  throw new Error(`Model "${resolved}" is not on disk (lms ls). LM Studio has no pull equivalent — ${hint}`)
}

export function ollamaPullModel(tag: string): void {
  // eslint-disable-next-line no-console
  console.log(`[llm e2e] ollama pull ${tag}…`)
  execSync(`ollama pull ${tag}`, { stdio: 'inherit', env: process.env })
}

/** Pull when missing (Ollama); on LM Studio verify modelKey is on disk (`lms ls`). */
export async function ensureOllamaModelPulled(tag?: string): Promise<string> {
  if (resolveLocalLlmBackend() === 'lmstudio') {
    return ensureLmStudioModelAvailable(tag)
  }
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
  if (resolveLocalLlmBackend() === 'lmstudio') {
    return `openai/${m}`
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

/** CODE tier for implement/agent LLM e2e — prefers E2E_CODE_MODEL / CODE_MODEL. */
export function resolveCodeVisionModel(): string {
  for (const key of ['E2E_CODE_MODEL', 'CODE_MODEL', 'E2E_HEAVY_MODEL', 'HEAVY_MODEL'] as const) {
    const raw = process.env[key]?.trim()
    if (raw) return visionModelFromTag(raw)
  }
  return resolveVisionModel()
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

/**
 * Remove persisted Cecli workspace state from the shared LLM e2e workspace.
 * Other suites (spec-gen, todo-list) create tasks and agent `todo.txt` under `.cecli/`;
 * a leftover **active** todo makes the next chat turn auto-inject the task spec, which
 * forces the think tier and breaks router-tier assertions. Call in setup for tests that
 * need a clean, todo-free session (e.g. the auto-router lane).
 */
export function clearLlmE2eWorkspaceTodos(): void {
  const meta = path.join(LLM_E2E_WORKSPACE, '.cecli')
  try {
    fs.rmSync(meta, { recursive: true, force: true })
  } catch {
    /* best-effort: absent or locked is fine */
  }
}

/** Env vars the headless core needs for LiteLLM → local backend. */
export function ollamaEnvForCore(): Record<string, string> {
  const out: Record<string, string> = {}
  const file = loadLocalLlmEnv()
  const backend = resolveLocalLlmBackend()
  const host = resolveOllamaHost()
  if (backend === 'lmstudio') {
    out.BRIGHTVISION_LLM_BACKEND = 'lmstudio'
    out.BRIGHTVISION_LLM_BACKEND_URL = host
    out.OPENAI_API_BASE = lmstudioApiBase()
    out.OPENAI_API_KEY =
      process.env.OPENAI_API_KEY?.trim() ||
      file.OPENAI_API_KEY?.trim() ||
      'lm-studio'
    if (host) out.OLLAMA_HOST = host
    return out
  }
  if (host) out.OLLAMA_API_BASE = host
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
  const backend = resolveLocalLlmBackend()
  const host = resolveOllamaHost()
  if (backend === 'lmstudio') {
    try {
      const base = lmstudioApiBase()
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: 'Bearer lm-studio' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      throw new Error(
        `LM Studio not reachable at ${host} (${err}). Start LM Studio and enable Local Server.`
      )
    }
    const tag = await resolveOllamaTagWithFallback()
    if (!tag) {
      throw new Error('No E2E model configured (E2E_OLLAMA_MODEL or DATA_MODEL in local-llm.env)')
    }
    return
  }
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

const WARMUP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'local-llm-warmup-for-tests.sh')

function codeModelWarmMarkerPath(): string {
  return path.join(os.tmpdir(), 'bv-e2e-code-model-warmed')
}

function readCodeModelWarmMarker(): string {
  try {
    return fs.readFileSync(codeModelWarmMarkerPath(), 'utf8').trim()
  } catch {
    return ''
  }
}

function writeCodeModelWarmMarker(bareTag: string): void {
  fs.writeFileSync(codeModelWarmMarkerPath(), bareTag, 'utf8')
}

/** Vision/LiteLLM id for a bare local model tag (router tier warmup). */
export function visionWarmupModelId(bareTag: string): string {
  const tag = bareTag.trim()
  if (!tag) return tag
  if (resolveLocalLlmBackend() === 'lmstudio') {
    return tag.startsWith('openai/') ? tag : `openai/${tag}`
  }
  if (tag.startsWith('ollama_chat/') || tag.startsWith('ollama/')) return tag
  return `ollama_chat/${tag}`
}

/**
 * Run ``scripts/local-llm-warmup-for-tests.sh`` for one model.
 * Router think tier: ``exclusive: true`` unloads fast+code so a large THINK_MODEL fits.
 */
export function warmLocalLlmModelTag(
  bareTag: string,
  opts: { exclusive?: boolean } = {}
): void {
  const exclusive = opts.exclusive ?? true
  execFileSync('sh', [WARMUP_SCRIPT], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      E2E_OLLAMA_MODEL: visionWarmupModelId(bareTag),
      OLLAMA_WARMUP_EXCLUSIVE: exclusive ? '1' : '0',
    },
    timeout: Number(process.env.OLLAMA_WARMUP_MAX_S ?? 180) * 1000 + 30_000,
  })
}

/** Mid-suite LM Studio/Ollama reset after long /agent turns (mirrors pytest ``recover_local_llm_for_tests``). */
export function recoverLocalLlmForTests(): void {
  if (process.env.E2E_SKIP_OLLAMA_WARMUP === '1') return
  const tag = defaultE2eOllamaTag()
  execFileSync('sh', [WARMUP_SCRIPT], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      E2E_OLLAMA_MODEL: visionWarmupModelId(tag),
      OLLAMA_WARMUP_EXCLUSIVE: '0',
      LMS_WARMUP_RESTART_SERVER: resolveLocalLlmBackend() === 'lmstudio' ? '1' : '0',
    },
    timeout: Number(process.env.OLLAMA_WARMUP_MAX_S ?? 180) * 1000 + 30_000,
  })
}

/** Load CODE tier before implement LLM specs (Lab sets ``E2E_CODE_MODEL`` from ``local-llm.env``). */
export function warmCodeModelForImplementE2e(): void {
  if (process.env.E2E_SKIP_OLLAMA_WARMUP === '1') return
  const codeBare = normalizeOllamaTag(resolveCodeVisionModel())
  const chatBare = normalizeOllamaTag(resolveVisionModel())
  if (!codeBare || codeBare === chatBare) return
  const alreadyWarmed = readCodeModelWarmMarker() === codeBare
  execFileSync('sh', [WARMUP_SCRIPT], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      E2E_OLLAMA_MODEL: visionWarmupModelId(codeBare),
      OLLAMA_WARMUP_EXCLUSIVE: alreadyWarmed ? '0' : '1',
      OLLAMA_WARMUP_SKIP_IF_LOADED: alreadyWarmed ? '1' : '0',
      LMS_WARMUP_RESTART_SERVER: '0',
    },
    timeout: Number(process.env.OLLAMA_WARMUP_MAX_S ?? 180) * 1000 + 30_000,
  })
  writeCodeModelWarmMarker(codeBare)
  process.env.BV_E2E_CODE_MODEL_WARMED = codeBare
}

export function isHeavyCodeVisionModel(): boolean {
  const code = (process.env.E2E_CODE_MODEL ?? resolveCodeVisionModel()).toLowerCase()
  return /27b|32b|70b|qwen3\.6/.test(code)
}

/** Env for spawning Vision API — must not put repo root on PYTHONPATH (shadows `cecli`). */
export function buildVisionCoreEnv(
  extra: Record<string, string> = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  env.PYTHONSAFEPATH = '1'
  env.BRIGHT_VISION_HEADLESS = '1'
  env.BRIGHT_VISION_ROOT = env.BRIGHT_VISION_ROOT ?? REPO_ROOT
  env.BV_ROOT = env.BV_ROOT ?? REPO_ROOT
  delete env.PYTHONPATH
  return env
}
