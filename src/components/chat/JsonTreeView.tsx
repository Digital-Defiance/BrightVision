import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Box, Collapse, IconButton, Typography } from '@mui/material'
import { useState } from 'react'

function previewValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') {
    const t = value.length > 48 ? `${value.slice(0, 45)}…` : value
    return JSON.stringify(t)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.length}]`
  if (typeof value === 'object') return `{${Object.keys(value as object).length}}`
  return String(value)
}

function JsonTreeNode({
  label,
  value,
  depth = 0,
  defaultOpen = depth < 2,
}: {
  label?: string
  value: unknown
  depth?: number
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const isBranch =
    (Array.isArray(value) && value.length > 0) ||
    (value !== null && typeof value === 'object' && !Array.isArray(value))

  if (!isBranch) {
    return (
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          pl: depth * 1.5,
          py: 0.15,
          fontFamily: 'var(--vision-font-terminal, monospace)',
          fontSize: '0.75rem',
        }}
      >
        {label != null && (
          <Typography component="span" variant="caption" color="primary.light" sx={{ flexShrink: 0 }}>
            {label}:
          </Typography>
        )}
        <Typography component="span" variant="caption" color="text.primary">
          {previewValue(value)}
        </Typography>
      </Box>
    )
  }

  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((item, i) => [String(i), item] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)

  const summary = Array.isArray(value)
    ? `Array (${value.length})`
    : `Object (${entries.length} keys)`

  return (
    <Box sx={{ pl: depth * 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        <IconButton
          size="small"
          aria-label={open ? 'Collapse' : 'Expand'}
          onClick={() => setOpen((v) => !v)}
          sx={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            p: 0.25,
          }}
        >
          <ExpandMoreIcon sx={{ fontSize: 16 }} />
        </IconButton>
        {label != null && (
          <Typography component="span" variant="caption" color="primary.light" sx={{ mr: 0.5 }}>
            {label}:
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {summary}
        </Typography>
      </Box>
      <Collapse in={open}>
        <Box sx={{ borderLeft: 1, borderColor: 'divider', ml: 1.25, pl: 0.5 }}>
          {entries.map(([key, child]) => (
            <JsonTreeNode key={key} label={key} value={child} depth={depth + 1} defaultOpen={depth < 1} />
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}

export function JsonTreeView({ value }: { value: unknown }) {
  return (
    <Box
      data-testid="json-tree-view"
      sx={{
        mt: 0.5,
        p: 1,
        borderRadius: 1,
        bgcolor: 'action.selected',
        overflowX: 'auto',
      }}
    >
      <JsonTreeNode value={value} defaultOpen />
    </Box>
  )
}
