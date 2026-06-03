import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { buildVisionCoreEnv, coreHealthUrl, ollamaEnvForCore, REPO_ROOT } from './llmEnv'

const PID_FILE = path.join(REPO_ROOT, '.e2e-llm-core.pid')
const CORE_PORT = 8741

/**
 * Free listeners on ``port`` only (not clients). Broad ``lsof -ti tcp:PORT`` also
 * matches Vite preview proxy connections to :8741 and kills :4173 (ERR_CONNECTION_REFUSED).
 * Same filter as ``scripts/free-core-port.sh``.
 */
function killListenersOnPort(port: number): void {
  try {
    const out = execFileSync(
      'lsof',
      ['-ti', `tcp:${port}`, '-sTCP:LISTEN'],
      { encoding: 'utf8' }
    ).trim()
    if (!out) return
    for (const pidStr of out.split(/\s+/)) {
      const pid = Number(pidStr)
      if (pid > 0) {
        try {
          process.kill(pid, 'SIGTERM')
        } catch {
          /* already gone */
        }
      }
    }
  } catch {
    /* port idle or lsof unavailable */
  }
}

/**
 * Venv `bin/python3` is often a symlink to Homebrew. Do not realpath it — spawning the
 * base interpreter skips pyvenv.cfg and site-packages (uvicorn, bright_vision_core).
 */
function repoRoots(repoRoot: string): string[] {
  const roots = new Set<string>()
  if (repoRoot) roots.add(repoRoot)
  try {
    roots.add(fs.realpathSync(repoRoot))
  } catch {
    /* keep logical path */
  }
  return [...roots]
}

function resolvePython(repoRoot: string): string {
  const roots = repoRoots(repoRoot)
  const candidates: string[] = []

  const add = (p: string | undefined) => {
    if (!p) return
    if (path.isAbsolute(p)) {
      candidates.push(p)
      return
    }
    for (const root of roots) {
      candidates.push(path.join(root, p))
    }
  }

  add(process.env.E2E_PYTHON)
  for (const root of roots) {
    candidates.push(path.join(root, '.venv', 'bin', 'python3'))
    candidates.push(path.join(root, '.venv', 'bin', 'python'))
  }
  const venv = process.env.VIRTUAL_ENV
  if (venv) {
    candidates.push(path.join(venv, 'bin', 'python3'))
    candidates.push(path.join(venv, 'bin', 'python'))
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return path.join(roots[0] ?? repoRoot, '.venv', 'bin', 'python3')
}

function assertPythonReady(python: string, repoRoot: string): void {
  try {
    execFileSync(
      python,
      ['-c', 'import uvicorn, bright_vision_core'],
      { cwd: repoRoot, env: buildVisionCoreEnv(), stdio: 'pipe' }
    )
  } catch {
    throw new Error(
      `E2E python cannot import uvicorn/bright_vision_core (${python}).\n` +
        `  source activate.sh   # from ${repoRoot}\n` +
        `  export E2E_PYTHON="${path.join(repoRoot, '.venv', 'bin', 'python3')}"`
    )
  }
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
  throw new Error(`Vision API did not become healthy within ${timeoutMs}ms (${lastErr})`)
}

export async function startRealCoreServer(): Promise<void> {
  // Always restart for LLM/integration e2e so :8741 picks up current code + timeout env.
  const forceRestart = process.env.E2E_INTEGRATION === '1' || process.env.E2E_LLM === '1'
  if (forceRestart) {
    await stopRealCoreServer()
    killListenersOnPort(CORE_PORT)
  } else if (fs.existsSync(PID_FILE)) {
    try {
      const oldPid = Number(fs.readFileSync(PID_FILE, 'utf8').trim())
      if (oldPid > 0) process.kill(oldPid, 0)
      await waitForHealth(5_000)
      return
    } catch {
      fs.unlinkSync(PID_FILE)
    }
  }

  const repoRoot = fs.realpathSync(REPO_ROOT)
  const python = resolvePython(repoRoot)
  if (!fs.existsSync(python)) {
    throw new Error(
      `E2E python not found (${python}). From repo root run: source activate.sh\n` +
        `  (same path for shell and tests — avoid mixing /Users/... and /Volumes/... clones)\n` +
        `  export E2E_PYTHON="${path.join(repoRoots(repoRoot)[0] ?? repoRoot, '.venv', 'bin', 'python3')}"`
    )
  }
  assertPythonReady(python, repoRoot)

  const env = buildVisionCoreEnv({
    ...ollamaEnvForCore(),
    // Cap /agent preproc during LLM e2e (default product: unlimited). Override via env.
    VISION_AGENT_PREPROC_TIMEOUT_S: process.env.VISION_AGENT_PREPROC_TIMEOUT_S ?? '600',
    VISION_SLASH_PREPROC_TIMEOUT_S: process.env.VISION_SLASH_PREPROC_TIMEOUT_S ?? '300',
    BV_COMPACT_SPEC_GEN: process.env.BV_COMPACT_SPEC_GEN ?? '1',
    LLM_SPEC_GEN_TIMEOUT_S: process.env.LLM_SPEC_GEN_TIMEOUT_S ?? '1800',
    LLM_SPEC_GEN_TURN_TIMEOUT_S: process.env.LLM_SPEC_GEN_TURN_TIMEOUT_S ?? '1800',
  })

  const serveCli = path.join(repoRoot, '.venv', 'bin', 'bright-vision-core-serve')
  const useServeCli = fs.existsSync(serveCli)
  const child: ChildProcess = spawn(
    useServeCli ? serveCli : python,
    useServeCli
      ? ['--host', '127.0.0.1', '--port', String(CORE_PORT)]
      : [
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
      cwd: repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  child.on('error', (err) => {
    console.error(`[e2e-core] spawn failed: ${err.message}`)
  })

  if (!child.pid) {
    throw new Error(
      `Failed to spawn Vision API (uvicorn) with ${python}. Run: source activate.sh`
    )
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

/** Recover :8741 after a wedged spec-gen or long LLM turn (serial e2e suite). */
export async function restartRealCoreServer(): Promise<void> {
  await stopRealCoreServer()
  killListenersOnPort(CORE_PORT)
  await new Promise((r) => setTimeout(r, 500))
  await startRealCoreServer()
}
