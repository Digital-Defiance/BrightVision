/** Detect server/client spec job timeout errors. */
export function isSpecJobTimeoutError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('timed out') && (m.includes('spec generation') || m.includes('spec job'))
}

export function specJobTimeoutHint(wallTimeoutS: number): string {
  const min = Math.round(wallTimeoutS / 60)
  return `Spec generation hit the ${min}-minute limit before the model finished. Increase timeouts in Settings → Spec generation, or use Extend & retry.`
}
