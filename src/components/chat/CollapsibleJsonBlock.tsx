import { useMemo, useState } from 'react'
import { Box, Collapse, IconButton, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

export function tryParseJsonText(text: string): unknown | null {
  const t = text.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return null
  try {
    return JSON.parse(t) as unknown
  } catch {
    return null
  }
}

export function CollapsibleJsonBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(true)
  const parsed = useMemo(() => tryParseJsonText(text), [text])
  if (parsed == null) return null

  const pretty = JSON.stringify(parsed, null, 2)
  const keys =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.keys(parsed as object).length
      : Array.isArray(parsed)
        ? (parsed as unknown[]).length
        : 0
  const summary = Array.isArray(parsed)
    ? `JSON array (${keys} items)`
    : `JSON object (${keys} keys)`

  return (
    <Box sx={{ mt: 0.5, pr: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <IconButton
          size="small"
          aria-label={open ? 'Collapse JSON' : 'Expand JSON'}
          onClick={() => setOpen((v) => !v)}
          sx={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
        <Typography variant="caption" color="text.secondary">
          {summary}
        </Typography>
      </Box>
      <Collapse in={open}>
        <Typography
          component="pre"
          variant="body2"
          sx={{
            m: 0,
            mt: 0.5,
            p: 1,
            borderRadius: 1,
            bgcolor: 'action.selected',
            whiteSpace: 'pre-wrap',
            overflowX: 'auto',
            fontSize: '0.75rem',
          }}
        >
          {pretty}
        </Typography>
      </Collapse>
    </Box>
  )
}
