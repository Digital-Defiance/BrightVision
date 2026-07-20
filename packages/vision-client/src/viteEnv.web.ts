/** Vite dev/build — static `import.meta.env` substitution. */
export function readViteEnv(key: string): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>
  const value = env[key]
  return value != null && value !== '' ? value : undefined
}
