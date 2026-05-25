import { invoke } from '@tauri-apps/api/core'
import type { OllamaModelRow, OllamaModelsSnapshot } from '../ipc/localLlm'
import { resolveLocalLlmForConfig } from '../ipc/localLlm'
import { isTauriRuntime } from '../ipc/isTauri'
import type { VisionConfig } from '../ipc/config'

function modelName(entry: Record<string, unknown>): string | null {
  const name = entry.name ?? entry.model
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

function formatBytes(n: number): string {
  const gb = 1024 ** 3
  const mb = 1024 ** 2
  if (n >= gb) return `${(n / gb).toFixed(1)} GB`
  if (n >= mb) return `${(n / mb).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function entryToRow(entry: Record<string, unknown>): OllamaModelRow | null {
  const name = modelName(entry)
  if (!name) return null
  const sizeNum = typeof entry.size === 'number' ? entry.size : null
  const vramNum = typeof entry.size_vram === 'number' ? entry.size_vram : null
  const expires =
    typeof entry.expires_at === 'string' && entry.expires_at.trim()
      ? entry.expires_at.trim()
      : null
  return {
    name,
    size: sizeNum && sizeNum > 0 ? formatBytes(sizeNum) : null,
    vram: vramNum && vramNum > 0 ? `VRAM ${formatBytes(vramNum)}` : null,
    expiresAt: expires,
  }
}

export function rowsFromOllamaApiBody(body: unknown): OllamaModelRow[] {
  if (!body || typeof body !== 'object') return []
  const models = (body as { models?: unknown }).models
  if (!Array.isArray(models)) return []
  const rows = models
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map(entryToRow)
    .filter((r): r is OllamaModelRow => r !== null)
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

async function fetchOllamaEndpoint(host: string, path: 'api/ps' | 'api/tags'): Promise<unknown> {
  const base = host.replace(/\/$/, '')
  const res = await fetch(`${base}/${path}`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`${path}: HTTP ${res.status}`)
  }
  return res.json()
}

async function fetchSnapshotWeb(host: string, modelTag: string): Promise<OllamaModelsSnapshot> {
  try {
    const [tagsBody, psBody] = await Promise.all([
      fetchOllamaEndpoint(host, 'api/tags'),
      fetchOllamaEndpoint(host, 'api/ps').catch(() => ({ models: [] })),
    ])
    const tagsRows = rowsFromOllamaApiBody(tagsBody)
    const psRows = rowsFromOllamaApiBody(psBody)
    const tag = modelTag.trim()
    const configuredInPs =
      !!tag &&
      psRows.some((r: OllamaModelRow) => r.name === tag || r.name.startsWith(`${tag}:`))
    return {
      ollamaHost: host,
      reachable: true,
      configuredTag: tag,
      configuredInPs,
      tagsText: '',
      psText: '',
      tagsRows,
      psRows,
    }
  } catch (err) {
    return {
      ollamaHost: host,
      reachable: false,
      configuredTag: modelTag,
      configuredInPs: false,
      tagsText: err instanceof Error ? err.message : String(err),
      psText: '',
      tagsRows: [],
      psRows: [],
    }
  }
}

/** Latest Ollama model listings for Settings and `/ps` in chat. */
export async function fetchOllamaModelsSnapshot(
  config: VisionConfig
): Promise<OllamaModelsSnapshot> {
  const { ollamaHost, modelTag } = resolveLocalLlmForConfig(config)
  const tag = modelTag ?? ''
  if (isTauriRuntime()) {
    return invoke<OllamaModelsSnapshot>('ollama_models_snapshot', {
      ollamaHost,
      modelTag: tag,
    })
  }
  return fetchSnapshotWeb(ollamaHost, tag)
}
