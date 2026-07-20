import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { startRealCoreServer } from './helpers/realCoreServer'
import {
  defaultE2eOllamaTag,
  isLlmE2eEnabled,
  isRouterLlmE2eEnabled,
  resolveLocalLlmBackend,
  resolveRouterModelTags,
  REPO_ROOT,
  visionWarmupModelId,
} from './helpers/llmEnv'
import { buildOllamaWarmupPlan } from '../src/utils/ollamaWarmupPlan'

const WARMUP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'local-llm-warmup-for-tests.sh')

/** Run the warmup script for one model tag. `exclusive` unloads other resident models first. */
function warmModelTag(tag: string, opts: { exclusive: boolean }): void {
  execFileSync('sh', [WARMUP_SCRIPT], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      E2E_OLLAMA_MODEL: visionWarmupModelId(tag),
      // Router lane needs fast+code+think resident together; do not evict between warms.
      OLLAMA_WARMUP_EXCLUSIVE: opts.exclusive ? '1' : '0',
    },
    timeout: Number(process.env['OLLAMA_WARMUP_MAX_S'] ?? 180) * 1000 + 30_000,
  })
}

/**
 * Warm the E2E local LLM model(s) before any LLM test runs. Mirrors the pytest lane's
 * `ensure_ollama_for_llm_e2e`. Without this, the first e2e:llm test can stall while the
 * backend cold-loads under VRAM pressure, tripping the orchestrator's GPU-stall abort.
 */
function warmLocalLlmForLlmE2e(): void {
  if (process.env['E2E_SKIP_OLLAMA_WARMUP'] === '1') return
  const routerLane = isRouterLlmE2eEnabled()
  const defaultModel =
    process.env['E2E_OLLAMA_MODEL'] ??
    (resolveLocalLlmBackend() === 'lmstudio'
      ? `openai/${defaultE2eOllamaTag()}`
      : `ollama_chat/${defaultE2eOllamaTag()}`)
  const routerTags = routerLane ? resolveRouterModelTags() : undefined
  const deferThinkWarmup = routerLane && resolveLocalLlmBackend() === 'lmstudio'
  const plan = buildOllamaWarmupPlan({
    routerLane,
    defaultModel,
    routerTags,
    deferThinkWarmup,
  })
  const backendLabel = resolveLocalLlmBackend() === 'lmstudio' ? 'LM Studio' : 'Ollama'
  try {
    if (routerLane) {
      const thinkDeferred = deferThinkWarmup && routerTags?.thinkTag?.trim()
      console.error(
        thinkDeferred
          ? `[global-llm-setup] router lane — warming fast+code (keep resident): ${plan.map((s) => s.tag).join(', ')}; think (${routerTags!.thinkTag}) loads before think-tier test`
          : `[global-llm-setup] router lane — warming tier models (keep resident): ${plan.map((s) => s.tag).join(', ')}`
      )
    } else {
      console.error(`[global-llm-setup] warming ${backendLabel} model (unloads competitors)…`)
    }
    for (const step of plan) {
      warmModelTag(step.tag, { exclusive: step.exclusive })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[global-llm-setup] ${backendLabel} warmup did not complete: ${msg}`)
  }
}

export default async function globalSetup(): Promise<void> {
  process.env['E2E_LLM'] = '1'
  if (!isLlmE2eEnabled()) return
  const phased = process.env['E2E_SPEC_GEN_PHASED'] === '1'
  console.error(
    `[global-llm-setup] E2E_LLM=1 E2E_SPEC_GEN_PHASED=${process.env['E2E_SPEC_GEN_PHASED'] ?? '(unset)'} E2E_CODE_MODEL=${process.env['E2E_CODE_MODEL'] ?? '(unset)'}`
  )
  if (phased) {
    console.error('[global-llm-setup] phased spec-gen file enabled')
  } else {
    console.error('[global-llm-setup] all-layers spec-gen only (default)')
  }
  warmLocalLlmForLlmE2e()
  await startRealCoreServer()
}
