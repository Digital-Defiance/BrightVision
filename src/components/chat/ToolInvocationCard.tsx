import CloseIcon from '@mui/icons-material/Close'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Alert,
  Box,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { CollapsibleJsonBlock } from './CollapsibleJsonBlock'
import type { ToolInvocationGroup } from '../../utils/toolOutputGroups'

interface ToolInvocationCardProps {
  group: ToolInvocationGroup
  onDismiss: () => void
}

export function ToolInvocationCard({ group, onDismiss }: ToolInvocationCardProps) {
  const [showOutput, setShowOutput] = useState(false)
  const isCommandTool = /^(command|ls)$/i.test(group.toolName)
  const borderColor = group.failed ? 'error.main' : 'divider'
  const headerColor = group.failed ? 'error.main' : 'primary.main'

  return (
    <Paper
      data-testid="chat-tool-invocation"
      data-tool-name={group.toolName}
      data-failed={group.failed ? 'true' : 'false'}
      variant="outlined"
      sx={{
        position: 'relative',
        maxWidth: '95%',
        borderColor,
        borderWidth: group.failed ? 2 : 1,
        bgcolor: group.failed
          ? (theme) => `${theme.palette.error.dark}22`
          : 'action.hover',
      }}
    >
      <IconButton
        size="small"
        aria-label="Dismiss tool output"
        onClick={onDismiss}
        sx={{ position: 'absolute', top: 4, right: 4, opacity: 0.6 }}
      >
        <CloseIcon fontSize="inherit" />
      </IconButton>

      <Box sx={{ px: 1.5, py: 1, pr: 4 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          {group.failed && <ErrorOutlineIcon color="error" sx={{ fontSize: 16 }} />}
          <Chip
            label={group.scope}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.65rem' }}
          />
          <Typography variant="caption" fontWeight="bold" color={headerColor}>
            {group.toolName}
          </Typography>
        </Stack>

        {group.args != null && (
          <Box sx={{ mt: 0.75 }}>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Arguments
            </Typography>
            <CollapsibleJsonBlock value={group.args} />
          </Box>
        )}

        {group.ranges.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
            {group.ranges.map((r) => (
              <Chip
                key={`${r.index}-${r.file}`}
                size="small"
                label={`${r.file} · ${r.start} → ${r.end}`}
                sx={{ height: 22, fontSize: '0.7rem', fontFamily: 'monospace' }}
              />
            ))}
          </Stack>
        )}

        {group.results.length > 0 && (
          <>
            {(group.args != null || group.ranges.length > 0) && <Divider sx={{ my: 1 }} />}
            {/* First result line is typically the command/args — always show it */}
            <Typography
              component="pre"
              variant="body2"
              sx={{
                m: 0,
                whiteSpace: 'pre-wrap',
                overflowX: 'auto',
                color: 'text.primary',
                fontSize: '0.75rem',
              }}
            >
              {group.results[0]}
            </Typography>
            {/* Remaining results: collapsible for Command, inline for everything else */}
            {group.results.length > 1 && isCommandTool ? (
              <>
                <Box
                  onClick={() => setShowOutput((v) => !v)}
                  sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}
                >
                  <ExpandMoreIcon
                    sx={{
                      fontSize: 16,
                      transform: showOutput ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {showOutput ? 'Hide output' : 'Show output'} ({group.results.length - 1} line{group.results.length - 1 !== 1 ? 's' : ''})
                  </Typography>
                </Box>
                <Collapse in={showOutput}>
                  <Typography
                    component="pre"
                    variant="body2"
                    sx={{
                      m: 0,
                      mt: 0.5,
                      whiteSpace: 'pre-wrap',
                      overflowX: 'auto',
                      color: 'text.primary',
                      maxHeight: 300,
                      overflow: 'auto',
                      fontSize: '0.75rem',
                    }}
                  >
                    {group.results.slice(1).join('\n')}
                  </Typography>
                </Collapse>
              </>
            ) : group.results.length > 1 ? (
              <Typography
                component="pre"
                variant="body2"
                sx={{
                  m: 0,
                  mt: 0.5,
                  whiteSpace: 'pre-wrap',
                  overflowX: 'auto',
                  color: 'text.primary',
                  fontSize: '0.75rem',
                }}
              >
                {group.results.slice(1).join('\n')}
              </Typography>
            ) : null}
          </>
        )}

        {group.error && (
          <Alert severity="error" sx={{ mt: 1, py: 0.25 }} variant="outlined">
            <Typography variant="body2" component="span">
              {group.error}
            </Typography>
          </Alert>
        )}
      </Box>
    </Paper>
  )
}
