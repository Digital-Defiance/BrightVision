/**
 * Fixture for LLM context e2e — value must stay stable (tests assert exact string).
 */
export const E2E_CONTEXT_MAGIC = 'bv-context-fixture-7f3a'

export function describeWidget(): string {
  return `widget magic=${E2E_CONTEXT_MAGIC}`
}
