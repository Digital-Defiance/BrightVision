import {
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { formatResourcePct } from '../../ipc/resourceSnapshot'
import { isTauriRuntime } from '../../ipc/isTauri'
import type { ThinkingTimingPrefs } from '../../theme/thinkingTimingPrefs'
import {
  buildTimingStatsView,
  computeOutputTps,
  formatModelLabel,
  formatOutputTps,
  formatThinkSharePct,
  thinkShare,
  TIMING_STATS_DISPLAY_ROWS,
  type ThinkingStatsStore,
} from '../../utils/thinkingStats'
import { formatDurationMs } from '../../utils/thinkingTiming'

interface TurnsTableMessageProps {
  store: ThinkingStatsStore
  filterModel: string | null
  timingPrefs: ThinkingTimingPrefs
  /** ISO timestamp when `/turns` was invoked (shown in header). */
  capturedAt?: string
}

export function TurnsTableMessage({
  store,
  filterModel,
  timingPrefs,
  capturedAt,
}: TurnsTableMessageProps) {
  const fmtOpts = { brightDate: timingPrefs.brightDateMode }
  const view = buildTimingStatsView(store, filterModel)
  const resourceMode = timingPrefs.resourceDisplay ?? 'avgPeak'
  const storedCount = view.totalTurns

  const resourceColLabel = (name: string) => {
    if (resourceMode === 'peak') return `${name} peak`
    if (resourceMode === 'avg') return `${name} avg`
    return `${name} avg/max`
  }

  if (storedCount === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ pr: 3 }}>
        No completed turns recorded yet. Finish a chat turn with **Thinking timers** enabled, then
        run `/turns` again.
      </Typography>
    )
  }

  const sumResponseMs = view.response.sum
  const sumThinkMs = view.think.sum

  return (
    <Stack spacing={1} data-testid="turns-table-message" sx={{ pr: 3 }}>
      <Typography variant="subtitle2" fontWeight={700}>
        Turn history
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {storedCount} turn{storedCount === 1 ? '' : 's'} in local session stats (newest first, table
        shows last {TIMING_STATS_DISPLAY_ROWS}
        {storedCount > TIMING_STATS_DISPLAY_ROWS ? ` · ${storedCount} stored` : ''}). CSV export in
        Settings is separate — `/turns` reads in-memory history (max 300), not the CSV file.
        {capturedAt ? ` Snapshot: ${new Date(capturedAt).toLocaleString()}.` : ''}
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
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
                </>
              )}
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
                    maxWidth: 140,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontSize: '0.75rem',
                  }}
                  title={row.model}
                >
                  {formatModelLabel(row.model)}
                </TableCell>
                <TableCell align="right">{formatDurationMs(row.responseMs, fmtOpts)}</TableCell>
                <TableCell align="right">
                  {formatOutputTps(computeOutputTps(row.tokensReceived, row.responseMs))}
                </TableCell>
                <TableCell align="right">{formatDurationMs(row.thinkMs, fmtOpts)}</TableCell>
                <TableCell align="right">{formatThinkSharePct(thinkShare(row))}</TableCell>
                {isTauriRuntime() && (
                  <>
                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                      {formatResourcePct(row.avgCpuPct, row.peakCpuPct, resourceMode)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                      {formatResourcePct(row.avgMemPct, row.peakMemPct, resourceMode)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            <TableRow
              sx={{
                '& td': { fontWeight: 700, borderTop: 2, borderColor: 'divider' },
              }}
              data-testid="turns-table-summary-row"
            >
              <TableCell colSpan={2}>Total ({storedCount} turns)</TableCell>
              <TableCell align="right">{formatDurationMs(sumResponseMs, fmtOpts)}</TableCell>
              <TableCell align="right">—</TableCell>
              <TableCell align="right">{formatDurationMs(sumThinkMs, fmtOpts)}</TableCell>
              <TableCell align="right">{formatThinkSharePct(view.avgThinkShare)}</TableCell>
              {isTauriRuntime() && (
                <>
                  <TableCell align="right">—</TableCell>
                  <TableCell align="right">—</TableCell>
                </>
              )}
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  )
}
