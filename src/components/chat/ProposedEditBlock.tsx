import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import type { AssistantContentSegment } from '../../utils/proposedEdits'
import { ChatFenceBlock } from './ChatFenceBlock'

interface ProposedEditBlockProps {
  segment: Extract<AssistantContentSegment, { type: 'proposed_edit' }>
  applied: boolean
  defaultExpanded?: boolean
  canApply?: boolean
  onApply?: () => Promise<void>
  onOpenInEditor?: (path: string) => void
}

function kindLabel(kind: string): string {
  if (kind === 'search_replace') return 'SEARCH/REPLACE'
  if (kind === 'fenced_file') return 'File proposal'
  return 'Code block'
}

export function ProposedEditBlock({
  segment,
  applied,
  defaultExpanded = false,
  canApply = false,
  onApply,
  onOpenInEditor,
}: ProposedEditBlockProps) {
  const [applying, setApplying] = useState(false)

  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onApply || applying || applied) return
    setApplying(true)
    try {
      await onApply()
    } finally {
      setApplying(false)
    }
  }

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    onOpenInEditor?.(segment.title)
  }

  const fenceLang = segment.kind === 'search_replace' ? 'text' : segment.language

  return (
    <Accordion
      disableGutters
      defaultExpanded={defaultExpanded}
      sx={{
        bgcolor: 'action.hover',
        border: 1,
        borderColor: applied ? 'success.dark' : 'warning.dark',
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />}>
        <Typography variant="body2" sx={{ fontSize: '0.8rem', flex: 1, mr: 1 }}>
          {segment.title}
        </Typography>
        <Chip
          label={applied ? 'Applied' : 'Proposed only'}
          size="small"
          color={applied ? 'success' : 'warning'}
          variant="outlined"
          sx={{ mr: 0.5, fontSize: '0.65rem', height: 22 }}
        />
        <Chip
          label={kindLabel(segment.kind)}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.65rem', height: 22 }}
        />
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {!applied && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            {canApply
              ? 'Apply writes this block to your project (exact or fuzzy SEARCH match). The engine may still propose the same edit until the turn finishes.'
              : 'Apply is available in the desktop app. Shown in chat until Cecli applies it or you use Apply.'}
          </Typography>
        )}
        <Box sx={{ mb: 1 }}>
          <ChatFenceBlock language={fenceLang} body={segment.body} complete />
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {canApply && onApply && !applied && (
            <Button
              size="small"
              variant="contained"
              disabled={applying}
              onClick={(e) => void handleApply(e)}
              data-testid="proposed-edit-apply"
            >
              {applying ? <CircularProgress size={16} color="inherit" /> : 'Apply to workspace'}
            </Button>
          )}
          {onOpenInEditor && segment.title && (
            <Button size="small" variant="outlined" onClick={handleOpen}>
              Open in editor
            </Button>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}
