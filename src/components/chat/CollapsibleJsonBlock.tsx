import { Box, Collapse, IconButton, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useMemo, useState } from 'react'
import { parseAgentJsonText } from '../../utils/jsonParse'
import { JsonTreeView } from './JsonTreeView'

export function tryParseJsonText(text: string): unknown | null {
  return parseAgentJsonText(text)
}

function jsonSummary(parsed: unknown): string {
  if (Array.isArray(parsed)) return `JSON array (${parsed.length} items)`
  if (parsed !== null && typeof parsed === 'object') {
    return `JSON object (${Object.keys(parsed as object).length} keys)`
  }
  return 'JSON value'
}

export function CollapsibleJsonBlock({
  text,
  value: valueProp,
}: {
  text?: string
  value?: unknown
}) {
  const [open, setOpen] = useState(true)
  const parsed = useMemo(
    () => (valueProp !== undefined ? valueProp : text ? parseAgentJsonText(text) : null),
    [text, valueProp]
  )
  if (parsed == null) return null

  return (
    <Box sx={{ mt: 0.5, pr: 3 }} data-testid="collapsible-json-block">
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
          {jsonSummary(parsed)}
        </Typography>
      </Box>
      <Collapse in={open}>
        <JsonTreeView value={parsed} />
      </Collapse>
    </Box>
  )
}
