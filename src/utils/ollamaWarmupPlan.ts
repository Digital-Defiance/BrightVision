/**
 * Pure planning for the e2e:llm Ollama warmup (consumed by `e2e/global-llm-setup.ts`).
 *
 * Lives under `src/` so the unit suite (vitest scans `src/**`) can cover it — it has no
 * Playwright or browser dependencies.
 *
 * Each step warms one model tag. `exclusive` runs the warmup script with
 * `OLLAMA_WARMUP_EXCLUSIVE=1` (unloads other resident models first); non-exclusive steps
 * keep previously warmed models resident.
 *
 * Router lane: warm all configured tier models (fast/code/think) and keep them resident
 * together — only the first step is exclusive (frees VRAM from non-tier models), the rest
 * are additive. Warming a single model exclusively would evict the router's tier models, so
 * the first fast-tier turn would cold-load, stall, and escalate fast→code→think (wrong tier).
 */
export interface WarmupStep {
  tag: string
  exclusive: boolean
}

export interface WarmupPlanInput {
  routerLane: boolean
  defaultModel: string
  routerTags?: { fastTag?: string; codeTag?: string; thinkTag?: string }
}

export function buildOllamaWarmupPlan(input: WarmupPlanInput): WarmupStep[] {
  if (input.routerLane) {
    const { fastTag, codeTag, thinkTag } = input.routerTags ?? {}
    const ordered = [fastTag, codeTag, thinkTag].filter(
      (t): t is string => Boolean(t && t.trim())
    )
    const unique = [...new Set(ordered)]
    if (unique.length === 0) {
      // No tier tags resolved — fall back to the default model so the lane still warms.
      return [{ tag: input.defaultModel, exclusive: true }]
    }
    return unique.map((tag, i) => ({ tag, exclusive: i === 0 }))
  }
  return [{ tag: input.defaultModel, exclusive: true }]
}
