import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import BugReportIcon from '@mui/icons-material/BugReport'
import CloseIcon from '@mui/icons-material/Close'
import { Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import type { RecentSpecJob } from '../../utils/recentSpecJob'
import { specJobChipColor, specJobChipLabel } from '../../utils/recentSpecJob'

export interface SpecJobStatusChipProps {
  job: RecentSpecJob
  onCancel?: () => void
  onCopyJobId: () => void
  onExportDebug: () => void
  onDismiss?: () => void
}

/** Header chip for a background spec job — stays visible after finish/crash until dismissed. */
export function SpecJobStatusChip({
  job,
  onCancel,
  onCopyJobId,
  onExportDebug,
  onDismiss,
}: SpecJobStatusChipProps) {
  const running = job.outcome === 'running'
  const exportHint = running
    ? 'Export spec job debug (use if generation stalls)'
    : 'Export spec job debug bundle'
  return (
    <Stack direction="row" alignItems="center" spacing={0.25} data-testid="spec-generating-chip">
      <Tooltip
        title={
          running
            ? `Spec job ${job.id} — copy or export debug while running`
            : `Spec job ${job.id} — export debug after failure or completion`
        }
      >
        <Chip
          label={specJobChipLabel(job)}
          size="small"
          color={specJobChipColor(job.outcome)}
          variant={running ? 'outlined' : 'filled'}
          onDelete={running ? onCancel : onDismiss}
          deleteIcon={running ? undefined : <CloseIcon />}
        />
      </Tooltip>
      <Tooltip title="Copy job ID">
        <IconButton
          size="small"
          aria-label="Copy spec job ID"
          data-testid="spec-job-copy-id"
          onClick={onCopyJobId}
        >
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={exportHint}>
        <IconButton
          size="small"
          aria-label="Export spec job debug"
          data-testid="spec-job-export-debug"
          onClick={onExportDebug}
        >
          <BugReportIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
        debug
      </Typography>
    </Stack>
  )
}
