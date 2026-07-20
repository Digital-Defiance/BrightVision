import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined'
import { IconButton, Popover, Tooltip, Typography } from '@mui/material'
import { useCallback, useState } from 'react'

interface TurnActivityHintOverlayProps {
  hint: string
  stalled: boolean
}

/** Floating turn-status control — does not consume vertical layout space. */
export function TurnActivityHintOverlay({ hint, stalled }: TurnActivityHintOverlayProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)

  const toggle = useCallback((el: HTMLElement | null) => {
    setAnchorEl((prev) => (prev && el === prev ? null : el))
  }, [])

  if (!hint) return null

  const Icon = stalled ? WarningAmberOutlinedIcon : InfoOutlinedIcon
  const title = stalled ? 'Turn may be stuck — click for details' : 'Turn in progress — click for details'

  return (
    <>
      <Tooltip title={open ? '' : title}>
        <IconButton
          size="small"
          data-testid="turn-activity-hint"
          aria-label={title}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(e) => toggle(e.currentTarget)}
          sx={{
            width: 28,
            height: 28,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: stalled ? 'warning.dark' : 'info.dark',
            color: stalled ? 'warning.light' : 'info.light',
            opacity: 0.92,
            boxShadow: 1,
            '&:hover': { opacity: 1, bgcolor: 'background.paper' },
          }}
        >
          <Icon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: { maxWidth: 420, p: 1.5 },
          },
        }}
      >
        <Typography variant="caption" component="p" sx={{ whiteSpace: 'pre-wrap' }}>
          {hint}
        </Typography>
      </Popover>
    </>
  )
}
