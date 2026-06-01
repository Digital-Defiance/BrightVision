import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import SaveAltOutlinedIcon from '@mui/icons-material/SaveAltOutlined'
import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { formatResourcePct } from '../../ipc/resourceSnapshot'
import type { TimingResourceDisplay } from '../../theme/thinkingTimingPrefs'
import { isTauriRuntime } from '../../ipc/isTauri'
import {
  downloadThinkingStatsCsv,
  writeTimingStatsCsvFile,
} from '../../ipc/timingStatsCsv'
import type { ThinkingTimingPrefs } from '../../theme/thinkingTimingPrefs'
import {
  buildTimingStatsView,
  computeOutputTps,
  computeRunningAvgOutputTps,
  exportThinkingStatsJson,
  formatModelLabel,
  formatOutputTps,
  formatThinkSharePct,
  listModelsInHistory,
  thinkShare,
  TIMING_STATS_DISPLAY_ROWS,
  type ThinkingStatsStore,
} from '../../utils/thinkingStats'
import { formatDurationMs } from '../../utils/thinkingTiming'

interface StatCardProps {
  label: string
  value: string
  sub?: string
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        flex: '1 1 140px',
        minWidth: 120,
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" display="block">
          {sub}
        </Typography>
      )}
    </Paper>
  )
}

function DistRow({
  label,
  dist,
}: {
  label: string
  dist: { count: number; min: number; max: number; mean: number; median: number; p90: number }
}) {
  if (dist.count === 0) return null
  return (
    <Typography variant="body2" color="text.secondary">
      <strong>{label}</strong> — avg {formatDurationMs(dist.mean)}, median{' '}
      {formatDurationMs(dist.median)}, p90 {formatDurationMs(dist.p90)}, min{' '}
      {formatDurationMs(dist.min)}, max {formatDurationMs(dist.max)} ({dist.count} samples)
    </Typography>
  )
}

interface ThinkingStatsPanelProps {
  store: ThinkingStatsStore
  currentModel: string
  workingDir: string
  timingPrefs: ThinkingTimingPrefs
  onTimingPrefsChange: (next: ThinkingTimingPrefs) => void
  onClearModel: () => void
  onClearAll: () => void
  onCsvError?: (message: string) => void
  onCsvSuccess?: (message: string) => void
}

export function ThinkingStatsPanel({
  store,
  currentModel,
  workingDir,
  timingPrefs,
  onTimingPrefsChange,
  onClearModel,
  onClearAll,
  onCsvError,
  onCsvSuccess,
}: ThinkingStatsPanelProps) {
  const models = useMemo(() => listModelsInHistory(store), [store])
  const [filter, setFilter] = useState<'all' | 'current'>('current')
  const [csvBusy, setCsvBusy] = useState(false)

  const filterModel =
    filter === 'current' ? (currentModel.trim() || 'unknown') : null
  const view = useMemo(
    () => buildTimingStatsView(store, filterModel),
    [store, filterModel]
  )

  const handleExportJson = () => {
    const json = exportThinkingStatsJson(store)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bright-vision-timing-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadCsv = () => {
    downloadThinkingStatsCsv(store, filterModel)
    onCsvSuccess?.(`Downloaded ${store.history.length} turns as CSV`)
  }

  const handleWriteCsv = async () => {
    const path = timingPrefs.timingStatsCsvPath.trim()
    if (!path) {
      onCsvError?.('Enter a CSV path (workspace-relative)')
      return
    }
    setCsvBusy(true)
    try {
      const count = filterModel
        ? store.history.filter((r) => r.model === filterModel).length
        : store.history.length
      await writeTimingStatsCsvFile(workingDir, path, store, filterModel)
      onCsvSuccess?.(`Wrote ${count} turns to ${path}`)
    } catch (err) {
      onCsvError?.(err instanceof Error ? err.message : String(err))
    } finally {
      setCsvBusy(false)
    }
  }

  if (store.history.length === 0) {
    return (
      <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary" data-testid="timing-stats-empty">
          No timing history yet. Complete a chat turn (Send → done) to record response, think time,
          output tok/s (when core reports Tokens:), and peak CPU/RAM/GPU (desktop).
        </Typography>
      </Box>
    )
  }

  const storedCount = filterModel
    ? store.history.filter((r) => r.model === filterModel).length
    : store.history.length

  const resourceMode: TimingResourceDisplay = timingPrefs.resourceDisplay ?? 'avgPeak'
  const resourceColLabel = (name: string) => {
    if (resourceMode === 'peak') return `${name} peak`
    if (resourceMode === 'avg') return `${name} avg`
    return `${name} avg/max`
  }

  return (
    <Box sx={{ mt: 2, width: '100%', minWidth: 0 }} data-testid="timing-stats-panel">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="timing-stats-filter-label">Scope</InputLabel>
          <Select
            labelId="timing-stats-filter-label"
            label="Scope"
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'current')}
            data-testid="timing-stats-filter"
          >
            <MenuItem value="current">Current model ({currentModel || 'unknown'})</MenuItem>
            <MenuItem value="all">All models ({models.length})</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={handleExportJson}
          data-testid="timing-stats-export"
        >
          Export JSON
        </Button>
        <Button
          size="small"
          color="inherit"
          onClick={onClearModel}
          data-testid="timing-stats-clear-model"
        >
          Clear model
        </Button>
        <Button
          size="small"
          color="inherit"
          startIcon={<DeleteOutlineIcon />}
          onClick={onClearAll}
          data-testid="timing-stats-clear-all"
        >
          Clear all
        </Button>
      </Stack>

      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="CSV file (workspace-relative)"
          value={timingPrefs.timingStatsCsvPath}
          onChange={(e) =>
            onTimingPrefsChange({ ...timingPrefs, timingStatsCsvPath: e.target.value })
          }
          placeholder=".cecli/timing-history.csv"
          helperText={
            isTauriRuntime()
              ? `Export all ${storedCount} stored turns (not only the table below). Download works in browser dev too.`
              : 'Download CSV exports full history in the browser; file path write requires the desktop app.'
          }
          fullWidth
          data-testid="timing-stats-csv-path"
        />
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={handleDownloadCsv}
            data-testid="timing-stats-csv-download"
          >
            Download CSV
          </Button>
          {isTauriRuntime() && (
            <Button
              size="small"
              variant="contained"
              startIcon={<SaveAltOutlinedIcon />}
              disabled={csvBusy || !timingPrefs.timingStatsCsvPath.trim()}
              onClick={() => void handleWriteCsv()}
              data-testid="timing-stats-csv-write"
            >
              Write CSV to project
            </Button>
          )}
          {isTauriRuntime() && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={timingPrefs.timingStatsAutoAppendCsv}
                  disabled={!timingPrefs.timingStatsCsvPath.trim()}
                  onChange={(_, v) =>
                    onTimingPrefsChange({ ...timingPrefs, timingStatsAutoAppendCsv: v })
                  }
                />
              }
              label="Append row after each turn"
            />
          )}
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <StatCard label="Turns" value={String(view.totalTurns)} />
        <StatCard
          label="Avg response"
          value={formatDurationMs(view.response.mean)}
          sub={`median ${formatDurationMs(view.response.median)}`}
        />
        <StatCard
          label="Avg output TPS"
          value={formatOutputTps(view.avgOutputTps)}
          sub="running avg · received ÷ response"
        />
        <StatCard
          label="Avg think"
          value={formatDurationMs(view.think.mean)}
          sub={`median ${formatDurationMs(view.think.median)}`}
        />
        <StatCard
          label="P90 response"
          value={formatDurationMs(view.response.p90)}
          sub={`max ${formatDurationMs(view.response.max)}`}
        />
        <StatCard
          label="Think share"
          value={formatThinkSharePct(view.avgThinkShare)}
          sub="think ÷ response (avg)"
        />
        {filter === 'all' && (
          <StatCard label="Models" value={String(view.modelsUsed)} />
        )}
      </Stack>

      <Stack spacing={0.75} sx={{ mb: 2 }}>
        <DistRow label="Response time" dist={view.response} />
        <DistRow label="Think time" dist={view.think} />
      </Stack>

      {filter === 'all' && view.byModel.length > 1 && (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 220 }}>
          <Table size="small" stickyHeader data-testid="timing-stats-by-model">
            <TableHead>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell align="right">Turns</TableCell>
                <TableCell align="right">Avg response</TableCell>
                <TableCell align="right">Avg TPS</TableCell>
                <TableCell align="right">Avg think</TableCell>
                <TableCell align="right">Think %</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {view.byModel.map((m) => {
                const modelRecords = store.history.filter((r) => r.model === m.model)
                const avgTps = computeRunningAvgOutputTps(modelRecords)
                return (
                  <TableRow key={m.model} hover>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.model}
                    </TableCell>
                    <TableCell align="right">{m.turns}</TableCell>
                    <TableCell align="right">{formatDurationMs(m.response.mean)}</TableCell>
                    <TableCell align="right">{formatOutputTps(avgTps)}</TableCell>
                    <TableCell align="right">{formatDurationMs(m.think.mean)}</TableCell>
                    <TableCell align="right">{formatThinkSharePct(m.avgThinkShare)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
        History (newest first, last {TIMING_STATS_DISPLAY_ROWS} turns
        {storedCount > TIMING_STATS_DISPLAY_ROWS ? ` · ${storedCount} stored` : ''}
        )
        {isTauriRuntime()
          ? ` · CPU/RAM/GPU: ${resourceMode === 'avgPeak' ? 'avg / peak' : resourceMode} % while the turn runs (system-wide; not used for ETA)`
          : ''}
        {' · TPS when core emits a usage line (↑↓ or Tokens:) on the turn'}
      </Typography>
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ maxHeight: 360, width: '100%', overflow: 'auto' }}
      >
        <Table size="small" stickyHeader data-testid="timing-stats-history">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Model</TableCell>
              <TableCell align="right">Response</TableCell>
              <TableCell align="right">TPS</TableCell>
              <TableCell align="right">Think</TableCell>
              <TableCell align="right">Think %</TableCell>
              {isTauriRuntime() && (
                <>
                  <TableCell align="right">{resourceColLabel('CPU')}</TableCell>
                  <TableCell align="right">{resourceColLabel('RAM')}</TableCell>
                  <TableCell align="right">{resourceColLabel('GPU')}</TableCell>
                </>
              )}
              <TableCell align="right">Prompt</TableCell>
              <TableCell align="right">Out tok</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {view.history.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                  {new Date(row.at).toLocaleString()}
                </TableCell>
                <TableCell
                  sx={{
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--vision-font-chat, monospace)',
                  }}
                  title={row.model}
                >
                  {formatModelLabel(row.model)}
                </TableCell>
                <TableCell align="right">{formatDurationMs(row.responseMs)}</TableCell>
                <TableCell align="right">
                  {formatOutputTps(computeOutputTps(row.tokensReceived, row.responseMs))}
                </TableCell>
                <TableCell align="right">{formatDurationMs(row.thinkMs)}</TableCell>
                <TableCell align="right">{formatThinkSharePct(thinkShare(row))}</TableCell>
                {isTauriRuntime() && (
                  <>
                    <TableCell
                      align="right"
                      sx={{ fontFamily: 'var(--vision-font-chat, monospace)', fontSize: '0.75rem' }}
                      title={
                        row.resourceSampleCount
                          ? `${row.resourceSampleCount} samples · avg then peak %`
                          : undefined
                      }
                    >
                      {formatResourcePct(row.avgCpuPct, row.peakCpuPct, resourceMode)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontFamily: 'var(--vision-font-chat, monospace)', fontSize: '0.75rem' }}
                    >
                      {formatResourcePct(row.avgMemPct, row.peakMemPct, resourceMode)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontFamily: 'var(--vision-font-chat, monospace)', fontSize: '0.75rem' }}
                    >
                      {formatResourcePct(row.avgGpuPct, row.peakGpuPct, resourceMode)}
                    </TableCell>
                  </>
                )}
                <TableCell align="right">{row.promptChars.toLocaleString()}</TableCell>
                <TableCell align="right">
                  {row.tokensReceived != null ? row.tokensReceived.toLocaleString() : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
