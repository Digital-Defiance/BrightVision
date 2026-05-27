#!/usr/bin/env node
/**
 * Create bench-submissions/{id}.json from a GitHub issue form body.
 * Env: ISSUE_BODY, ISSUE_NUMBER, ISSUE_AUTHOR, OUT_DIR (optional)
 */
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { submissionFromIssueFields } from './build-bench-leaderboard.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

/** Map issue template headings → field ids */
const HEADING_TO_FIELD = {
  'display name': 'display_name',
  'bench nickname': 'display_name',
  hardware: 'hardware',
  model: 'model',
  'turn count': 'turn_count',
  'median output tps': 'median_tps',
  'p90 response (ms)': 'p90_response_ms',
  'median response (ms)': 'median_response_ms',
  'avg think share (%)': 'avg_think_share_pct',
  'median peak gpu (%)': 'median_peak_gpu_pct',
  privacy: 'hide_github',
}

/**
 * @param {string} body
 */
export function parseIssueFormBody(body) {
  const fields = /** @type {Record<string, string | boolean>} */ ({})
  const chunks = body.split(/\n(?=### )/)
  for (const chunk of chunks) {
    const m = chunk.match(/^### (.+)\n([\s\S]*)$/)
    if (!m) continue
    const heading = m[1].trim().toLowerCase()
    let value = m[2].trim()
    const fieldId = HEADING_TO_FIELD[heading]
    if (!fieldId) continue
    if (fieldId === 'hide_github') {
      fields.hide_github = /\[x\]/i.test(value)
      continue
    }
    if (value.startsWith('```')) {
      value = value.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim()
    }
    fields[fieldId] = value
  }
  return fields
}

async function main() {
  const body = process.env.ISSUE_BODY || ''
  const num = process.env.ISSUE_NUMBER || '0'
  const author = process.env.ISSUE_AUTHOR || ''
  if (!author) throw new Error('ISSUE_AUTHOR required')
  const fields = parseIssueFormBody(body)
  const submission = submissionFromIssueFields(fields, author)
  const outDir = process.env.OUT_DIR || path.join(ROOT, 'bench-submissions')
  await mkdir(outDir, { recursive: true })
  const safeAuthor = author.replace(/[^a-zA-Z0-9-]/g, '')
  const filename = `issue-${num}-${safeAuthor}.json`
  const outPath = path.join(outDir, filename)
  await writeFile(outPath, `${JSON.stringify(submission, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${outPath}`)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) main().catch((e) => {
  console.error(e)
  process.exit(1)
})
