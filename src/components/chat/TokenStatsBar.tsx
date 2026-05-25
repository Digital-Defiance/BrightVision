import { Typography } from '@mui/material'

interface TokenStatsBarProps {
  stats: string | null
}

export function TokenStatsBar({ stats }: TokenStatsBarProps) {
  if (!stats) return null
  return (
    <Typography
      data-testid="token-stats"
      variant="caption"
      color="text.secondary"
      sx={{
        px: 1,
        py: 0.5,
        fontFamily: 'monospace',
        fontSize: '0.7rem',
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      {stats}
    </Typography>
  )
}
