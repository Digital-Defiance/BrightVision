export interface ImplementationStep {
  /** Step id from tasks_md (e.g. `1` or `1.3`). */
  number: number | string
  text: string
  done: boolean
}

const STEP_LINE =
  /^\s*-\s*\[([ xX])\]\s*(\d+(?:\.\d+)*)(?:\.\s+|\s+)(.+?)(?:\s*\(depends:\s*[^)]+\))?\s*$/i
const STEP_LINE_PLAIN = /^\s*(\d+(?:\.\d+)*)(?:\.\s+|\s+)(.+?)(?:\s*\(depends:\s*[^)]+\))?\s*$/i
const CHECKLIST_STEP = /^(\d+(?:\.\d+)*)(?:\.\s+|\s+)(.+)$/

/** Parse numbered implementation tasks from ``tasks_md`` markdown. */
export function parseImplementationSteps(tasksMd: string): ImplementationStep[] {
  const steps: ImplementationStep[] = []
  for (const line of tasksMd.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let m = STEP_LINE.exec(trimmed)
    if (m) {
      steps.push({
        number: m[2],
        text: m[3].trim(),
        done: m[1].toLowerCase() === 'x',
      })
      continue
    }
    m = STEP_LINE_PLAIN.exec(trimmed)
    if (m) {
      steps.push({
        number: m[1],
        text: m[2].trim(),
        done: false,
      })
    }
  }
  return steps.sort((a, b) => stepSortKey(a.number) - stepSortKey(b.number))
}

/** Prefer checklist progress when it carries numbered steps (Kiro-style sync). */
export function mergedImplementationSteps(
  tasksMd: string,
  checklist: { text: string; done: boolean }[]
): ImplementationStep[] {
  const fromChecklist: ImplementationStep[] = []
  for (const entry of checklist) {
    const m = CHECKLIST_STEP.exec(entry.text.trim())
    if (!m) continue
    fromChecklist.push({
      number: m[1],
      text: m[2].trim(),
      done: entry.done,
    })
  }
  if (fromChecklist.length > 0) {
    return fromChecklist.sort((a, b) => stepSortKey(a.number) - stepSortKey(b.number))
  }
  return parseImplementationSteps(tasksMd)
}

function stepSortKey(step: number | string): number {
  const parts = String(step).split('.').map((p) => parseInt(p, 10))
  let key = 0
  for (const part of parts) {
    key = key * 1000 + (Number.isFinite(part) ? part : 0)
  }
  return key
}

export function firstOpenImplementationStep(
  steps: ImplementationStep[]
): ImplementationStep | null {
  return steps.find((s) => !s.done) ?? null
}
