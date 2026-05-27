import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material'
import {
  AGENT_QUICK_COMMANDS,
  buildInvokeAgentCommand,
  buildSpawnAgentCommand,
  type SubAgentInfo,
} from '../../ipc/agentCommands'

interface ChatAgentBarProps {
  subagents: SubAgentInfo[]
  agentModeAvailable: boolean
  disabled?: boolean
  onPickCommand: (command: string) => void
}

export function ChatAgentBar({
  subagents,
  agentModeAvailable,
  disabled = false,
  onPickCommand,
}: ChatAgentBarProps) {
  const showBar = agentModeAvailable || subagents.length > 0
  if (!showBar) return null

  return (
    <Stack spacing={0.75} sx={{ mb: 1 }} data-testid="chat-agent-bar">
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
        <SmartToyOutlinedIcon sx={{ fontSize: 16, color: 'secondary.light', mr: 0.25 }} />
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Agents
        </Typography>
        {AGENT_QUICK_COMMANDS.map((cmd) => (
          <Tooltip
            key={cmd}
            title={
              cmd === '/agent'
                ? 'Runs tools before the main reply (up to ~5 min). Use Stop if stuck. For quick UI tweaks, type your request without /agent.'
                : cmd === '/invoke-agent'
                  ? 'Blocking sub-agent run — add name + prompt after click'
                  : cmd === '/spawn-agent'
                    ? 'Spawn sub-agent (headless: sends command to core)'
                    : 'Destroy stuck sub-agent'
            }
          >
            <Chip
              label={cmd}
              size="small"
              variant="outlined"
              color="secondary"
              disabled={disabled}
              onClick={() => onPickCommand(cmd === '/invoke-agent' ? '/invoke-agent ' : `${cmd} `)}
              sx={{
                fontSize: '0.7rem',
                borderColor: 'divider',
                '&:hover': { borderColor: 'secondary.main', color: 'secondary.light' },
              }}
            />
          </Tooltip>
        ))}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
          Sub-agents from <Box component="code">.md</Box> in{' '}
          <Box component="code">subagent_paths</Box> — configure in Settings
        </Typography>
      </Stack>
      {subagents.length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Registered:
          </Typography>
          {subagents.map((a) => (
            <Tooltip
              key={a.name}
              title={
                (a.model ? `Model: ${a.model}\n` : '') +
                (a.prompt_preview || 'No prompt preview')
              }
            >
              <Chip
                size="small"
                label={a.name}
                variant="filled"
                disabled={disabled}
                onClick={() => onPickCommand(buildInvokeAgentCommand(a.name))}
                onDoubleClick={() => onPickCommand(buildSpawnAgentCommand(a.name))}
                data-testid={`subagent-chip-${a.name}`}
                sx={{
                  fontSize: '0.68rem',
                  height: 22,
                  bgcolor: 'action.selected',
                  '& .MuiChip-label': { fontFamily: 'monospace' },
                }}
              />
            </Tooltip>
          ))}
          <Typography variant="caption" color="text.disabled">
            click → invoke · double-click → spawn
          </Typography>
        </Stack>
      )}
    </Stack>
  )
}
