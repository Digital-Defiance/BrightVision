import { invoke } from '@tauri-apps/api/core'

export const LOCAL_LLM_IPC_TIMEOUT_MS = 2000

/** Race Tauri invoke against a timeout (REQ-004.4). */
export async function invokeWithTimeout<T>(
  cmd: string,
  args: Record<string, unknown>,
  timeoutMs: number = LOCAL_LLM_IPC_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      invoke<T>(cmd, args),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`IPC timeout after ${timeoutMs}ms: ${cmd}`)),
          timeoutMs
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
