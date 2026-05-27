/**
 * Local LLM bench — client-side CSV → card JSON.
 * Keep CSV columns in sync with src/utils/thinkingStats.ts TIMING_STATS_CSV_HEADERS.
 */
const GITHUB_REPO = 'Digital-Defiance/BrightVision'
const CSV_HEADERS = [
  'at',
  'model',
  'response_ms',
  'think_ms',
  'think_share_pct',
  'prompt_chars',
  'tokens_sent',
  'tokens_received',
  'output_tps',
  'avg_cpu_pct',
  'peak_cpu_pct',
  'avg_mem_pct',
  'peak_mem_pct',
  'avg_gpu_pct',
  'peak_gpu_pct',
  'resource_sample_count',
]

const HARDWARE_OPTIONS = [
  ['apple-silicon', 'Apple Silicon'],
  ['nvidia-desktop', 'NVIDIA desktop'],
  ['nvidia-laptop', 'NVIDIA laptop'],
  ['amd-desktop', 'AMD desktop'],
  ['cpu-only', 'CPU only'],
  ['other', 'Other'],
]

/** @param {string} line */
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = false
      } else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** @param {string} text */
export function parseTimingStatsCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []
  let start = 0
  const first = parseCsvLine(lines[0]).map((c) => c.trim().toLowerCase())
  if (first[0] === 'at' || first.includes('response_ms')) start = 1
  const records = []
  for (let i = start; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length < 4) continue
    const model = (cols[1] || '').trim() || 'unknown'
    const responseMs = Number(cols[2])
    const thinkMs = Number(cols[3])
    if (!Number.isFinite(responseMs)) continue
    const tokensReceived = cols[7] !== '' ? Number(cols[7]) : undefined
    const peakGpu = cols[14] !== '' ? Number(cols[14]) : undefined
    records.push({
      at: cols[0] || new Date().toISOString(),
      model,
      responseMs: Math.max(0, responseMs),
      thinkMs: Math.max(0, thinkMs || 0),
      promptChars: Number(cols[5]) || 0,
      tokensReceived: Number.isFinite(tokensReceived) ? tokensReceived : undefined,
      peakGpuPct: Number.isFinite(peakGpu) ? peakGpu : undefined,
    })
  }
  return records
}

/** @param {number[]} values */
function median(values) {
  const nums = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (nums.length === 0) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}

/** @param {number[]} values @param {number} p */
function percentile(values, p) {
  const sorted = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))]
}

/** @param {ReturnType<parseTimingStatsCsv>} records */
export function aggregateRecords(records) {
  if (records.length === 0) return null
  const models = [...new Set(records.map((r) => r.model))]
  const primaryModel =
    models.length === 1
      ? models[0]
      : models.sort(
          (a, b) =>
            records.filter((r) => r.model === b).length -
            records.filter((r) => r.model === a).length
        )[0]
  const subset = records.filter((r) => r.model === primaryModel)
  const responses = subset.map((r) => r.responseMs)
  const tpsList = subset
    .map((r) => {
      if (r.tokensReceived == null || r.tokensReceived <= 0 || r.responseMs <= 0) return null
      return r.tokensReceived / (r.responseMs / 1000)
    })
    .filter((t) => t != null)
  const thinkShares = subset
    .map((r) => (r.responseMs > 0 ? Math.min(1, r.thinkMs / r.responseMs) : null))
    .filter((s) => s != null)
  const gpuPeaks = subset.map((r) => r.peakGpuPct).filter((n) => Number.isFinite(n))

  return {
    model: primaryModel,
    modelsInFile: models,
    turnCount: subset.length,
    medianTps: median(tpsList),
    meanTps: tpsList.length ? tpsList.reduce((a, b) => a + b, 0) / tpsList.length : null,
    p90ResponseMs: percentile(responses, 90),
    medianResponseMs: median(responses),
    avgThinkSharePct: thinkShares.length
      ? (thinkShares.reduce((a, b) => a + b, 0) / thinkShares.length) * 100
      : null,
    medianPeakGpuPct: median(gpuPeaks),
  }
}

/** @param {ReturnType<aggregateRecords>} agg */
export function buildSubmissionJson(agg, meta) {
  const displayName = meta.displayName.trim()
  const hardware = meta.hardware
  const hideGitHubOnWall = meta.hideGitHubOnWall
  return {
    schemaVersion: 1,
    displayName,
    hideGitHubOnWall,
    submittedAt: new Date().toISOString(),
    hardware,
    model: agg.model,
    stats: {
      turnCount: agg.turnCount,
      medianTps: round1(agg.medianTps),
      meanTps: agg.meanTps != null ? round1(agg.meanTps) : undefined,
      p90ResponseMs: round100(agg.p90ResponseMs),
      medianResponseMs: round100(agg.medianResponseMs),
      avgThinkSharePct: agg.avgThinkSharePct != null ? Math.round(agg.avgThinkSharePct) : undefined,
      medianPeakGpuPct: agg.medianPeakGpuPct != null ? Math.round(agg.medianPeakGpuPct) : undefined,
    },
    provenance: {
      source: 'brightvision-timing-csv',
      csvTurnsParsed: agg.turnCount,
      modelsInFile: agg.modelsInFile.length > 1 ? agg.modelsInFile : undefined,
    },
  }
}

function round1(n) {
  if (n == null || !Number.isFinite(n)) return undefined
  return Math.round(n * 10) / 10
}

function round100(n) {
  if (n == null || !Number.isFinite(n)) return undefined
  return Math.round(n / 100) * 100
}

export function formatModelLabel(model) {
  if (model.startsWith('ollama_chat/')) return model.slice('ollama_chat/'.length)
  if (model.startsWith('ollama/')) return model.slice('ollama/'.length)
  return model
}

export function formatTps(tps) {
  if (tps == null || !Number.isFinite(tps)) return '—'
  if (tps >= 100) return `${Math.round(tps)}`
  if (tps >= 10) return tps.toFixed(1)
  return tps.toFixed(2)
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export function prFilename(displayName, model) {
  const id = `${slugify(displayName)}-${slugify(formatModelLabel(model))}`.slice(0, 60)
  return `bench-submissions/${id}.json`
}

export function githubNewFileUrl(filename) {
  return `https://github.com/${GITHUB_REPO}/new/main?filename=${encodeURIComponent(filename)}`
}

export function githubIssueUrl() {
  return `https://github.com/${GITHUB_REPO}/issues/new?template=bench-card.yml`
}

/** @param {object} leaderboard */
export function renderLeaderboard(leaderboard, container) {
  const entries = leaderboard?.entries ?? []
  if (entries.length === 0) {
    container.innerHTML =
      '<p class="empty-leaderboard">No cards yet — be the first to submit via PR or issue.</p>'
    return
  }
  container.innerHTML = entries
    .map((e, i) => {
      const gh = e.github
        ? `<div class="gh"><a href="https://github.com/${e.github}" rel="noopener noreferrer">@${e.github}</a></div>`
        : ''
      return `<article class="lb-card">
        <div class="rank">#${i + 1}</div>
        <div class="tps">${formatTps(e.stats?.medianTps)} <span style="font-size:0.45em;font-family:var(--font-mono)">tok/s</span></div>
        <div class="name">${escapeHtml(e.displayName)}</div>
        <div class="model">${escapeHtml(formatModelLabel(e.model))}</div>
        <div class="gh">${e.stats?.turnCount ?? '—'} turns · ${escapeHtml(e.hardware)}</div>
        ${gh}
      </article>`
    })
    .join('')
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function init() {
  const dropzone = document.getElementById('dropzone')
  const fileInput = document.getElementById('csv-file')
  const displayName = document.getElementById('display-name')
  const modelFromCsv = document.getElementById('model-from-csv')
  const modelFromCsvValue = document.getElementById('model-from-csv-value')
  const hardware = document.getElementById('hardware')
  const hideGithub = document.getElementById('hide-github')
  const preview = document.getElementById('preview-card')
  const status = document.getElementById('status')
  const btnCopy = document.getElementById('btn-copy')
  const btnPr = document.getElementById('btn-pr')
  const btnIssue = document.getElementById('btn-issue')
  const lb = document.getElementById('leaderboard-grid')

  let agg = null
  let submission = null

  HARDWARE_OPTIONS.forEach(([val, label]) => {
    const opt = document.createElement('option')
    opt.value = val
    opt.textContent = label
    hardware.appendChild(opt)
  })

  function setStatus(msg, kind = '') {
    status.textContent = msg
    status.className = `status ${kind}`
  }

  function renderPreview() {
    if (!agg) {
      preview.className = 'preview-card empty'
      preview.innerHTML = 'Upload timing CSV to preview your card'
      modelFromCsv.hidden = true
      btnCopy.disabled = true
      btnPr.disabled = true
      return
    }
    modelFromCsvValue.textContent = formatModelLabel(agg.model)
    modelFromCsv.hidden = false
    preview.className = 'preview-card'
    preview.innerHTML = `
      <span class="badge">median TPS</span>
      <p class="tps">${formatTps(agg.medianTps)}</p>
      <p class="tps-label">tokens / sec · ${agg.turnCount} turns</p>
      <div class="meta">
        <span>Model <strong>${escapeHtml(formatModelLabel(agg.model))}</strong></span>
        <span>Response p90 <strong>${agg.p90ResponseMs != null ? Math.round(agg.p90ResponseMs) + ' ms' : '—'}</strong></span>
        <span>Think share <strong>${agg.avgThinkSharePct != null ? Math.round(agg.avgThinkSharePct) + '%' : '—'}</strong></span>
      </div>`
    updateSubmission()
  }

  function updateSubmission() {
    if (!agg || !displayName.value.trim()) {
      submission = null
      btnCopy.disabled = true
      btnPr.disabled = true
      return
    }
    submission = buildSubmissionJson(agg, {
      displayName: displayName.value,
      hardware: hardware.value,
      hideGitHubOnWall: hideGithub.checked,
    })
    btnCopy.disabled = false
    btnPr.disabled = false
    const fn = prFilename(submission.displayName, submission.model)
    btnPr.href = githubNewFileUrl(fn)
  }

  function handleFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const records = parseTimingStatsCsv(String(reader.result))
        if (records.length === 0) throw new Error('No data rows found')
        agg = aggregateRecords(records)
        if (!agg) throw new Error('Could not aggregate')
        if (agg.modelsInFile.length > 1) {
          setStatus(
            `Using ${agg.turnCount} turns for “${formatModelLabel(agg.model)}” (${agg.modelsInFile.length} models in file).`,
            'ok'
          )
        } else {
          setStatus(`Parsed ${records.length} turns.`, 'ok')
        }
        renderPreview()
      } catch (e) {
        agg = null
        renderPreview()
        setStatus(e instanceof Error ? e.message : 'Parse failed', 'err')
      }
    }
    reader.readAsText(file)
  }

  dropzone.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => handleFile(fileInput.files?.[0]))
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropzone.classList.add('dragover')
  })
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'))
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropzone.classList.remove('dragover')
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  })

  displayName.addEventListener('input', () => {
    renderPreview()
    updateSubmission()
  })
  hardware.addEventListener('change', updateSubmission)
  hideGithub.addEventListener('change', updateSubmission)

  btnCopy.addEventListener('click', async () => {
    if (!submission) return
    const text = JSON.stringify(submission, null, 2)
    await navigator.clipboard.writeText(text)
    setStatus('Copied JSON — paste into the new file on GitHub. CI adds @login when the PR merges.', 'ok')
  })

  btnIssue.href = githubIssueUrl()

  fetch('../data/leaderboard.v1.json')
    .then((r) => r.json())
    .then((data) => renderLeaderboard(data, lb))
    .catch(() => {
      lb.innerHTML = '<p class="empty-leaderboard">Leaderboard unavailable.</p>'
    })
}

init()
