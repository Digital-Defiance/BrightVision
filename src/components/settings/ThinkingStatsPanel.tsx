import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { formatPeakPct } from '../../ipc/resourceSnapshot'
import { isTauriRuntime } from '../../ipc/isTauri'
import {
  buildTimingStatsView,
  exportThinkingStatsJson,
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
  onClearModel: () => void
  onClearAll: () => void
}

export function ThinkingStatsPanel({
  store,
  currentModel,
  onClearModel,
  onClearAll,
}: ThinkingStatsPanelProps) {
  const models = useMemo(() => listModelsInHistory(store), [store])
  const [filter, setFilter] = useState<'all' | 'current'>('current')

  const filterModel =
    filter === 'current' ? (currentModel.trim() || 'unknown') : null
  const view = useMemo(
    () => buildTimingStatsView(store, filterModel),
    [store, filterModel]
  )

  const handleExport = () => {
    const json = exportThinkingStatsJson(store)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bright-vision-timing-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (store.history.length === 0) {
    return (
      <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary" data-testid="timing-stats-empty">
          No timing history yet. Complete a chat turn (Send → done) to record response, think time,
          and peak CPU/RAM/GPU (desktop).
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ mt: 2 }} data-testid="timing-stats-panel">
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
          onClick={handleExport}
          data-testid="timing-stats-export"
        >
          Export JSON
        </Button>
        <Button size="small" color="inherit" onClick={onClearModel} data-testid="timing-stats-clear-model">
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

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <StatCard label="Turns" value={String(view.totalTurns)} />
        <StatCard
          label="Avg response"
          value={formatDurationMs(view.response.mean)}
          sub={`median ${formatDurationMs(view.response.median)}`}
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
                <TableCell align="right">Avg think</TableCell>
                <TableCell align="right">Think %</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {view.byModel.map((m) => (
                <TableRow key={m.model} hover>
                  <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.model}
                  </TableCell>
                  <TableCell align="right">{m.turns}</TableCell>
                  <TableCell align="right">{formatDurationMs(m.response.mean)}</TableCell>
                  <TableCell align="right">{formatDurationMs(m.think.mean)}</TableCell>
                  <TableCell align="right">{formatThinkSharePct(m.avgThinkShare)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
        History (newest first, last {TIMING_STATS_DISPLAY_ROWS} turns
        {store.history.length > TIMING_STATS_DISPLAY_ROWS
          ? ` · ${store.history.length} stored`
          : ''}
        )
        {isTauriRuntime() ? ' · peak CPU/RAM/GPU sampled while the turn runs' : ''}
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320 }}>
        <Table size="small" stickyHeader data-testid="timing-stats-history">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              {filter === 'all' && <TableCell>Model</TableCell>}
              <TableCell align="right">Response</TableCell>
              <TableCell align="right">Think</TableCell>
              <TableCell align="right">Think %</TableCell>
              {isTauriRuntime() && (
                <>
                  <TableCell align="right">CPU peak</TableCell>
                  <TableCell align="right">RAM peak</TableCell>
                  <TableCell align="right">GPU peak</TableCell>
                </>
              )}
              <TableCell align="right">Prompt</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {view.history.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                  {new Date(row.at).toLocaleString()}
                </TableCell>
                {filter === 'all' && (
                  <TableCell
                    sx={{
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontSize: '0.75rem',
                    }}
                  >
                    {row.model}
                  </TableCell>
                )}
                <TableCell align="right">{formatDurationMs(row.responseMs)}</TableCell>
                <TableCell align="right">{formatDurationMs(row.thinkMs)}</TableCell>
                <TableCell align="right">{formatThinkSharePct(thinkShare(row))}</TableCell>
                {isTauriRuntime() && (
                  <>
                    <TableCell align="right">{formatPeakPct(row.peakCpuPct)}</TableCell>
                    <TableCell align="right">{formatPeakPct(row.peakMemPct)}</TableCell>
                    <TableCell align="right">{formatPeakPct(row.peakGpuPct)}</TableCell>
                  </>
                )}
                <TableCell align="right">{row.promptChars.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
