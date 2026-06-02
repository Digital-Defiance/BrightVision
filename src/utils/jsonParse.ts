/**
 * Parse JSON emitted by local models in tool args, tool output, and assistant prose.
 * Handles strict JSON, glued `{…}{…}` fragments, broken double-encoded arrays, and
 * simple objects like `{ "path": "src" }` when strict parse fails.
 */

/** Split glued local-model JSON values: `{…}{…}` → chunk strings. */
export function splitConcatenatedJson(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (!trimmed.includes('}{') && !trimmed.includes('][')) {
    return [trimmed]
  }
  const chunks: string[] = []
  let depth = 0
  let start = 0
  let inString = false
  let escape = false
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') depth += 1
    if (ch === '}' || ch === ']') depth -= 1
    if (depth === 0 && i >= start) {
      const chunk = trimmed.slice(start, i + 1).trim()
      if (chunk) chunks.push(chunk)
      start = i + 1
    }
  }
  const tail = trimmed.slice(start).trim()
  if (tail) chunks.push(tail)
  return chunks.length ? chunks : [trimmed]
}

/** Fallback split for glued objects when string-aware scan fails (broken inner quotes). */
export function splitGluedNaive(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed.includes('}{')) return [trimmed]
  const parts = trimmed.split(/\}\s*\{/)
  return parts.map((part, index) => {
    let chunk = part.trim()
    if (index > 0) chunk = `{${chunk}`
    if (index < parts.length - 1) chunk = `${chunk}}`
    return chunk
  })
}

function parseGluedAgentJson(trimmed: string): unknown | null {
  const chunks =
    splitConcatenatedJson(trimmed).length > 1
      ? splitConcatenatedJson(trimmed)
      : splitGluedNaive(trimmed)

  const merged: Record<string, unknown> = {}
  let saw = false

  const tasksFromFull = tryParseLenientTaskArray(trimmed)
  if (tasksFromFull) {
    merged.tasks = tasksFromFull
    saw = true
  }

  for (const chunk of chunks) {
    const c = chunk.trim()
    if (!c) continue

    const strict = tryStrictJsonParse(c)
    if (strict !== null && typeof strict === 'object' && !Array.isArray(strict)) {
      for (const [k, v] of Object.entries(strict as Record<string, unknown>)) {
        if (k === 'tasks' && tasksFromFull) continue
        merged[k] = k === 'tasks' && typeof v === 'string' ? coerceTasksField({ tasks: v }).tasks ?? v : v
      }
      saw = true
      continue
    }

    const obj = tryParseLenientObject(c)
    if (obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'tasks' && tasksFromFull) continue
        if (k === 'tasks' && typeof v === 'string') {
          const coerced = coerceTasksField({ tasks: v }).tasks
          if (coerced !== undefined) merged.tasks = coerced
        } else if (k !== 'tasks' || !merged.tasks) {
          merged[k] = v
        }
      }
      saw = true
    }
  }

  if (Array.isArray(merged.tasks)) {
    delete merged.done
    delete merged.task
  }

  return saw ? merged : null
}

function stripMarkdownCodeFence(text: string): string {
  const t = text.trim()
  const m = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```$/m.exec(t)
  return m ? m[1].trim() : t
}

function tryStrictJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/**
 * True when `text` is entirely valid JSON (optional outer trim / markdown fence only)
 * and the top-level value is an object or array — not a bare string, number, or boolean.
 */
export function isStrictJsonDocument(text: string): boolean {
  return parseStrictJsonDocument(text) !== null
}

/**
 * Parse only when the full document is strict JSON whose root is `{…}` or `[…]`.
 * Returns `null` for glued fragments, prose prefixes, and top-level literals (`"hi"`, `42`, `true`).
 */
export function parseStrictJsonDocument(text: string): unknown | null {
  const stripped = stripMarkdownCodeFence(text.trim())
  if (!stripped) return null
  const parsed = tryStrictJsonParse(stripped)
  if (parsed === null) return null
  if (typeof parsed !== 'object' || parsed === null) return null
  return parsed
}

function isJsonTreeRoot(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object'
}

function repairEmbeddedArrayString(text: string): string {
  let t = text.trim()
  if (t.startsWith('"') && t.endsWith('"') && t.includes('[{')) {
    t = t.slice(1, -1)
  }
  return t
}

/** Extract `"key": value` pairs from broken object text (path, limit, etc.). */
export function tryParseLenientObject(text: string): Record<string, unknown> | null {
  const raw = text.trim()
  if (!raw.startsWith('{')) return null

  const strict = tryStrictJsonParse(raw)
  if (strict && typeof strict === 'object' && strict !== null && !Array.isArray(strict)) {
    return strict as Record<string, unknown>
  }

  const out: Record<string, unknown> = {}

  const stringRe = /"([a-zA-Z_]\w*)"\s*:\s*"((?:\\.|[^"\\])*)"/g
  let m: RegExpExecArray | null
  while ((m = stringRe.exec(raw)) !== null) {
    out[m[1]] = m[2].replace(/\\"/g, '"')
  }

  const litRe = /"([a-zA-Z_]\w*)"\s*:\s*(true|false|null)\b/gi
  while ((m = litRe.exec(raw)) !== null) {
    const v = m[2].toLowerCase()
    out[m[1]] = v === 'null' ? null : v === 'true'
  }

  const numRe = /"([a-zA-Z_]\w*)"\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  while ((m = numRe.exec(raw)) !== null) {
    out[m[1]] = Number(m[2])
  }

  return Object.keys(out).length ? out : null
}

/** Parse UpdateTodoList-style task rows when inner array quotes are not escaped. */
export function tryParseLenientTaskArray(text: string): unknown[] | null {
  const raw = text.trim()
  if (!raw.includes('"done"') || !raw.includes('"task"')) return null
  const pattern =
    /\{\s*"done"\s*:\s*(true|false)\s*,\s*"task"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/gi
  const rows: Array<{ done: boolean; task: string }> = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw)) !== null) {
    rows.push({
      done: match[1].toLowerCase() === 'true',
      task: match[2].replace(/\\"/g, '"'),
    })
  }
  return rows.length ? rows : null
}

function coerceTasksField(obj: Record<string, unknown>): Record<string, unknown> {
  const tasks = obj.tasks
  if (typeof tasks === 'string') {
    const strict = tryStrictJsonParse(tasks)
    if (Array.isArray(strict)) return { ...obj, tasks: strict }
    const lenient = tryParseLenientTaskArray(tasks)
    if (lenient) return { ...obj, tasks: lenient }
  }
  return obj
}

function mergeGluedChunks(chunks: string[]): unknown | null {
  const merged: Record<string, unknown> = {}
  let saw = false

  for (const chunk of chunks) {
    const c = chunk.trim()
    if (!c) continue

    const strict = tryStrictJsonParse(c)
    if (strict !== null) {
      if (Array.isArray(strict)) return strict
      if (typeof strict === 'object') {
        Object.assign(merged, coerceTasksField(strict as Record<string, unknown>))
        saw = true
        continue
      }
    }

    const obj = tryParseLenientObject(c)
    if (obj) {
      Object.assign(merged, coerceTasksField(obj))
      saw = true
      continue
    }

    const tasks = tryParseLenientTaskArray(c)
    if (tasks) {
      merged.tasks = tasks
      saw = true
    }
  }

  return saw ? merged : null
}

function tryParseLenientValue(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

  for (const candidate of [trimmed, repairEmbeddedArrayString(trimmed)]) {
    const strict = tryStrictJsonParse(candidate)
    if (strict !== null) {
      if (typeof strict === 'object' && strict !== null && !Array.isArray(strict)) {
        return coerceTasksField(strict as Record<string, unknown>)
      }
      return strict
    }
  }

  if (trimmed.includes('}{')) {
    const glued = parseGluedAgentJson(trimmed)
    if (glued !== null) return glued
  }

  const chunks = splitConcatenatedJson(trimmed)
  if (chunks.length > 1) {
    const merged = mergeGluedChunks(chunks)
    if (merged !== null) return merged
  }

  const obj = tryParseLenientObject(trimmed)
  if (obj) return coerceTasksField(obj)

  const tasks = tryParseLenientTaskArray(trimmed)
  if (tasks) {
    const pathMatch = /"path"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/.exec(trimmed)
    if (pathMatch) {
      return { tasks, path: pathMatch[1].replace(/\\"/g, '"') }
    }
    return tasks
  }

  return null
}

/** True when text plausibly contains JSON the agent/tool layer emitted. */
export function looksLikeAgentJson(text: string): boolean {
  const t = stripMarkdownCodeFence(text.trim())
  if (!t) return false
  if (parseStrictJsonDocument(t) !== null) return true
  const lenient = tryParseLenientValue(t)
  return lenient !== null && isJsonTreeRoot(lenient)
}

/**
 * Parse agent/tool JSON from arbitrary text (tool I/O, assistant prose, fenced blocks).
 * Strict whole-document object/array first; lenient repair only when strict parse fails.
 */
export function parseAgentJsonText(text: string): unknown | null {
  const stripped = stripMarkdownCodeFence(text.trim())
  if (!stripped) return null
  const strict = parseStrictJsonDocument(stripped)
  if (strict !== null) return strict
  const lenient = tryParseLenientValue(stripped)
  if (lenient !== null && isJsonTreeRoot(lenient)) return lenient
  return null
}

/** @deprecated use parseAgentJsonText */
export function parseJsonToolText(text: string): unknown | null {
  return parseAgentJsonText(text)
}

/** @deprecated use parseAgentJsonText */
export function tryParseJsonValue(text: string): unknown | null {
  return parseAgentJsonText(text)
}
