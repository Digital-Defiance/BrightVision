import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { coreHealthUrl, REPO_ROOT } from './llmEnv'

const PID_FILE = path.join(REPO_ROOT, '.e2e-llm-core.pid')
const CORE_PORT = 8741

function resolvePython(): string {
  const candidates = [
    process.env.E2E_PYTHON,
    path.join(REPO_ROOT, '.venv', 'bin', 'python'),
    path.join(REPO_ROOT, 'bright-vision-core', '.venv', 'bin', 'python'),
  ].filter(Boolean) as string[]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return 'python3'
}

async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr = 'unknown'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(coreHealthUrl(), { signal: AbortSignal.timeout(2_000) })
      if (res.ok) {
        const body = (await res.json()) as { status?: string }
        if (body.status === 'ok') return
        lastErr = `health status=${body.status}`
      } else {
        lastErr = `HTTP ${res.status}`
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Vision core did not become healthy within ${timeoutMs}ms (${lastErr})`)
}

export async function startRealCoreServer(): Promise<void> {
  if (fs.existsSync(PID_FILE)) {
    try {
      const oldPid = Number(fs.readFileSync(PID_FILE, 'utf8').trim())
      if (oldPid > 0) process.kill(oldPid, 0)
      await waitForHealth(5_000)
      return
    } catch {
      fs.unlinkSync(PID_FILE)
    }
  }

  const python = resolvePython()
  const env = {
    ...process.env,
    BRIGHT_VISION_HEADLESS: '1',
    AIDER_VISION_HEADLESS: '1',
  }
  if (process.env.E2E_OLLAMA_HOST) {
    env.OLLAMA_API_BASE = process.env.E2E_OLLAMA_HOST
  }

  const child: ChildProcess = spawn(
    python,
    [
      '-m',
      'uvicorn',
      'bright_vision_core.http_api:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(CORE_PORT),
      '--log-level',
      'warning',
    ],
    {
      cwd: path.join(REPO_ROOT, 'bright-vision-core'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  if (!child.pid) {
    throw new Error('Failed to spawn Vision core (uvicorn)')
  }

  fs.writeFileSync(PID_FILE, String(child.pid))

  child.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim()
    if (line) console.error(`[e2e-core] ${line}`)
  })

  child.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`[e2e-core] exited code=${code} signal=${signal ?? ''}`)
    }
    try {
      fs.unlinkSync(PID_FILE)
    } catch {
      /* ignore */
    }
  })

  await waitForHealth(90_000)
}

export async function stopRealCoreServer(): Promise<void> {
  if (!fs.existsSync(PID_FILE)) return
  const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim())
  fs.unlinkSync(PID_FILE)
  if (!pid || pid <= 0) return
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    /* already stopped */
  }
}
