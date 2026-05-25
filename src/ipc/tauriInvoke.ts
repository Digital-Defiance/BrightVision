import { invoke } from '@tauri-apps/api/core'

/** Prevent indefinite hangs if the Rust command blocks. */
export async function invokeWithTimeout<T>(
  command: string,
  args: Record<string, unknown> = {},
  timeoutMs = 45_000
): Promise<T> {
  return Promise.race([
    invoke<T>(command, args),
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${command} timed out after ${timeoutMs / 1000}s`)),
        timeoutMs
      )
    }),
  ])
}
