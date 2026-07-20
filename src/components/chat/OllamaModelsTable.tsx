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
import { useTheme } from '@mui/material/styles'
import type { OllamaModelRow } from '../../ipc/localLlm'
import type { ModelHopperTier } from '../../theme/modelHopper'
import { normalizeHopperTier } from '../../theme/modelHopper'
import { normalizeModelRouteRole } from '../../theme/modelRouterPrefs'
import { modelRouteAccentColor } from '../../theme/modelRouteUi'

interface OllamaModelsTableProps {
  title: string
  host: string
  rows: OllamaModelRow[]
  emptyLabel?: string
  highlightTag?: string
  /** Model name → hopper tier, for row color-coding by tier. */
  tierMap?: Record<string, ModelHopperTier>
  /** LM Studio ps rows use status/variant columns differently from Ollama. */
  variant?: 'ollama' | 'lmstudio'
}

function normalizeTag(tag: string): string {
  return tag.replace(/^ollama_chat\//, '').replace(/^openai\//, '').trim()
}

function rowMatchesTag(name: string, tag: string): boolean {
  const bare = normalizeTag(tag)
  return name === bare || name.startsWith(`${bare}:`) || name.startsWith(`${bare}@`)
}

function resolveTier(
  rowName: string,
  tierMap?: Record<string, ModelHopperTier>
): ModelHopperTier | undefined {
  if (!tierMap) return undefined
  if (tierMap[rowName]) return tierMap[rowName]
  const bare = normalizeTag(rowName)
  if (tierMap[bare]) return tierMap[bare]
  return undefined
}

export function OllamaModelsTable({
  title,
  host,
  rows,
  emptyLabel = '(none)',
  highlightTag,
  tierMap,
  variant = 'ollama',
}: OllamaModelsTableProps) {
  const theme = useTheme()
  const bareHighlight = highlightTag ? normalizeTag(highlightTag) : ''
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
                <TableCell>Size</TableCell>
                <TableCell>{variant === 'lmstudio' ? 'Status' : 'Processor'}</TableCell>
                <TableCell>Context</TableCell>
                <TableCell>{variant === 'lmstudio' ? 'Variant' : 'Expires'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const highlighted =
                  !!bareHighlight && rowMatchesTag(row.name, bareHighlight)
                const tier = resolveTier(row.name, tierMap)
                const tierColor = tier
                  ? modelRouteAccentColor(theme, normalizeModelRouteRole(normalizeHopperTier(tier)))
                  : undefined
                return (
                  <TableRow
                    key={row.name}
                    selected={highlighted}
                    sx={{
                      ...(highlighted ? { bgcolor: 'action.selected' } : undefined),
                      ...(tierColor
                        ? { borderLeft: `3px solid ${tierColor}` }
                        : undefined),
                    }}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {row.name}
                    </TableCell>
                    <TableCell>{row.size ?? '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{row.processor ?? '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{row.context ? row.context.toLocaleString() : '—'}</TableCell>
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
