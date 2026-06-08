import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { startRealCoreServer } from './helpers/realCoreServer'
import { isLlmE2eEnabled, isRouterLlmE2eEnabled, resolveRouterModelTags, REPO_ROOT } from './helpers/llmEnv'
import { buildOllamaWarmupPlan } from '../src/utils/ollamaWarmupPlan'

const WARMUP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'ollama-warmup-for-tests.sh')

/** Run the warmup script for one model tag. `exclusive` unloads other resident models first. */
function warmModelTag(tag: string, opts: { exclusive: boolean }): void {
  execFileSync('sh', [WARMUP_SCRIPT], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      E2E_OLLAMA_MODEL: tag,
      // Router lane needs fast+code+think resident together; do not evict between warms.
      OLLAMA_WARMUP_EXCLUSIVE: opts.exclusive ? '1' : '0',
    },
    timeout: Number(process.env['OLLAMA_WARMUP_MAX_S'] ?? 180) * 1000 + 30_000,
  })
}

/**
 * Warm the E2E Ollama model(s) before any LLM test runs. Mirrors the pytest lane's
 * `ensure_ollama_for_llm_e2e`. Without this, the first e2e:llm test can stall while Ollama
 * cold-loads under VRAM pressure, tripping the orchestrator's GPU-stall abort (240s, GPU ~0%).
 *
 * Router lane (`E2E_MODEL_ROUTER=1`): warm every tier model (fast/code/think) and keep them
 * all resident — warming only the default model would evict the router's tier models, so the
 * first fast-tier turn would cold-load, stall, and escalate fast→code→think (wrong tier).
 */
function warmOllamaForLlmE2e(): void {
  if (process.env['E2E_SKIP_OLLAMA_WARMUP'] === '1') return
  const routerLane = isRouterLlmE2eEnabled()
  const plan = buildOllamaWarmupPlan({
    routerLane,
    defaultModel: process.env['E2E_OLLAMA_MODEL'] ?? 'ollama_chat/llama3.2:3b',
    routerTags: routerLane ? resolveRouterModelTags() : undefined,
  })
  try {
    if (routerLane) {
      console.error(
        `[global-llm-setup] router lane — warming tier models (keep resident): ${plan.map((s) => s.tag).join(', ')}`
      )
    } else {
      console.error('[global-llm-setup] warming Ollama model (unloads competitors)…')
    }
    for (const step of plan) {
      warmModelTag(step.tag, { exclusive: step.exclusive })
    }
  } catch (err) {
    // Non-fatal: a failed warmup should not block the suite (tests retry on cold start),
    // but surface the reason so a real stall is diagnosable.
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[global-llm-setup] Ollama warmup did not complete: ${msg}`)
  }
}

export default async function globalSetup(): Promise<void> {
  process.env['E2E_LLM'] = '1'
  if (!isLlmE2eEnabled()) return
  const phased = process.env['E2E_SPEC_GEN_PHASED'] === '1'
  console.error(
    `[global-llm-setup] E2E_LLM=1 E2E_SPEC_GEN_PHASED=${process.env['E2E_SPEC_GEN_PHASED'] ?? '(unset)'}`
  )
  if (phased) {
    console.error('[global-llm-setup] phased spec-gen file enabled')
  } else {
    console.error('[global-llm-setup] all-layers spec-gen only (default)')
  }
  warmOllamaForLlmE2e()
  await startRealCoreServer()
}
