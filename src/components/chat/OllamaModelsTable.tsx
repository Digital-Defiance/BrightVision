import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { OllamaModelRow } from '../../ipc/localLlm'

interface OllamaModelsTableProps {
  title: string
  host: string
  rows: OllamaModelRow[]
  emptyLabel?: string
  highlightTag?: string
}

function rowMatchesTag(name: string, tag: string): boolean {
  return name === tag || name.startsWith(`${tag}:`)
}

export function OllamaModelsTable({
  title,
  host,
  rows,
  emptyLabel = '(none)',
  highlightTag,
}: OllamaModelsTableProps) {
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden', mb: 1.5 }} data-testid="ollama-models-table">
      <Typography
        variant="caption"
        fontWeight={700}
        sx={{ display: 'block', px: 1.5, pt: 1, pb: 0.5 }}
      >
        {title}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', px: 1.5, pb: 1, fontFamily: 'monospace' }}
      >
        {host}
      </Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, pb: 1.5 }}>
          {emptyLabel}
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small" aria-label={title}>
            <TableHead>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell>VRAM</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Expires</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const highlighted =
                  !!highlightTag && rowMatchesTag(row.name, highlightTag)
                return (
                  <TableRow
                    key={row.name}
                    selected={highlighted}
                    sx={highlighted ? { bgcolor: 'action.selected' } : undefined}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {row.name}
                    </TableCell>
                    <TableCell>{row.vram ?? '—'}</TableCell>
                    <TableCell>{row.size ?? '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{row.expiresAt ?? '—'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  )
}
