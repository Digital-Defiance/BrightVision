import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { buildVisionCoreEnv, coreHealthUrl, ollamaEnvForCore, REPO_ROOT } from './llmEnv'

const PID_FILE = path.join(REPO_ROOT, '.e2e-llm-core.pid')
const CORE_PORT = 8741
/** Cold ``http_api`` import can take 30–90s; under Test Lab CPU/RAM load allow headroom. */
const DEFAULT_HEALTH_TIMEOUT_MS = 300_000

function coreHealthTimeoutMs(): number {
  const raw = process.env.E2E_CORE_HEALTH_TIMEOUT_MS?.trim()
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_HEALTH_TIMEOUT_MS
}

function childAlive(pid: number | undefined): boolean {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

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

function killStaleCoreServeProcesses(): void {
  const patterns = [
    `bright-vision-core-serve --host 127.0.0.1 --port ${CORE_PORT}`,
    `uvicorn bright_vision_core.http_api:app --host 127.0.0.1 --port ${CORE_PORT}`,
  ]
  for (const pat of patterns) {
    try {
      execFileSync('pkill', ['-f', pat], { stdio: 'ignore' })
    } catch {
      /* no matching process */
    }
  }
}

/** Warm .pyc / page cache so the spawned serve process imports faster. */
function prewarmHttpApiImport(python: string, repoRoot: string, env: NodeJS.ProcessEnv): void {
  if (process.env.E2E_SKIP_HTTP_API_PREWARM === '1') return
  console.error('[e2e-core] prewarming http_api import (cold cache can take 30–90s)…')
  const t0 = Date.now()
  try {
    execFileSync(
      python,
      ['-c', 'from bright_vision_core.http_api import app'],
      {
        cwd: repoRoot,
        env,
        stdio: 'pipe',
        timeout: coreHealthTimeoutMs(),
        maxBuffer: 10 * 1024 * 1024,
      }
    )
  } catch (err) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `http_api prewarm failed after ${elapsed}s (${msg}).\n` +
        `  source activate.sh; free RAM; sh scripts/free-core-port.sh\n` +
        `  or raise E2E_CORE_HEALTH_TIMEOUT_MS / set E2E_SKIP_HTTP_API_PREWARM=1`
    )
  }
  console.error(`[e2e-core] prewarm finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

function attachCoreServerOutput(child: ChildProcess, stderrLines: string[]): void {
  child.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      console.error(`[e2e-core stdout] ${trimmed}`)
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      stderrLines.push(trimmed)
      console.error(`[e2e-core] ${trimmed}`)
    }
  })
}

async function waitForHealth(
  timeoutMs: number,
  child?: ChildProcess,
  stderrLines: string[] = []
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr = 'unknown'
  let lastProgressLog = 0
  while (Date.now() < deadline) {
    if (child?.pid && !childAlive(child.pid)) {
      const tail = stderrLines.slice(-8).join('\n')
      throw new Error(
        `Vision API process exited before healthy (${lastErr})` +
          (tail ? `\n[e2e-core stderr tail]\n${tail}` : '')
      )
    }
    const now = Date.now()
    if (now - lastProgressLog >= 30_000) {
      lastProgressLog = now
      const elapsed = Math.round((now - (deadline - timeoutMs)) / 1000)
      const latest = stderrLines[stderrLines.length - 1]
      console.error(
        `[e2e-core] still waiting for /health (${elapsed}s/${Math.round(timeoutMs / 1000)}s` +
          `${latest ? `; latest stderr: ${latest}` : ''})`
      )
    }
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
  const tail = stderrLines.slice(-8).join('\n')
  throw new Error(
    `Vision API did not become healthy within ${timeoutMs}ms (${lastErr})` +
      (tail ? `\n[e2e-core stderr tail]\n${tail}` : '')
  )
}

export async function startRealCoreServer(): Promise<void> {
  // Always restart for LLM/integration e2e so :8741 picks up current code + timeout env.
  const forceRestart = process.env.E2E_INTEGRATION === '1' || process.env.E2E_LLM === '1'
  if (forceRestart) {
    await stopRealCoreServer()
    killStaleCoreServeProcesses()
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

  prewarmHttpApiImport(python, repoRoot, env)

  const serveCli = path.join(repoRoot, '.venv', 'bin', 'bright-vision-core-serve')
  const useServeCli = fs.existsSync(serveCli)
  const spawnCmd = useServeCli
    ? `${serveCli} --host 127.0.0.1 --port ${CORE_PORT}`
    : `${python} -m uvicorn bright_vision_core.http_api:app --host 127.0.0.1 --port ${CORE_PORT} --log-level warning`
  console.error(`[e2e-core] spawning Vision API (${spawnCmd})`)
  const stderrLines: string[] = []
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
      // stdout inherit: avoid pipe fill before headless stdio redirect; stderr piped for tail on failure.
      stdio: ['ignore', 'inherit', 'pipe'],
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
  attachCoreServerOutput(child, stderrLines)

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

  const healthTimeoutMs = coreHealthTimeoutMs()
  console.error(`[e2e-core] waiting for /health (timeout ${healthTimeoutMs}ms)`)
  await waitForHealth(healthTimeoutMs, child, stderrLines)
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
