import { Box, IconButton, Paper, Stack, Toolbar, Tooltip, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { DISPLAY_VISION } from '../../brand'
import { BrandLogo } from '../brand/BrandLogo'
import type { ProcessSnapshot } from '../../progress/types'
import type { TurnEtaEstimate } from '../../utils/turnEtaEstimate'
import type { LiveThinkingState } from '../../utils/thinkingTiming'
import type { ConnectionTone } from '../../utils/connectionStatus'
import { VisionActivityBar, type SpecJobActivity } from '../progress/VisionActivityBar'

export interface NavItem {
  id: string
  label: string
  icon: ReactNode
}

interface AppChromeProps {
  nav: NavItem[]
  activeTab: string
  onTabChange: (id: string) => void
  process: ProcessSnapshot
  specJob?: SpecJobActivity | null
  liveTiming?: LiveThinkingState | null
  turnEta?: TurnEtaEstimate | null
  headerExtra?: ReactNode
  /** Green = session live; amber = API up, no session; grey = stopped. */
  connectionTone?: ConnectionTone
  children: ReactNode
  /** CPU/RAM/GPU strip anchored in the left nav rail (not over main content). */
  railFooter?: ReactNode
  /** Opens About (version + credits). */
  onLogoClick?: () => void
}

export const VISION_SIDEBAR_W = 92

export function AppChrome({
  nav,
  activeTab,
  onTabChange,
  process,
  specJob = null,
  liveTiming = null,
  turnEta = null,
  headerExtra,
  connectionTone = 'stopped',
  children,
  railFooter,
  onLogoClick,
}: AppChromeProps) {
  const logoButtonSx = onLogoClick
    ? {
        border: 0,
        p: 0,
        m: 0,
        bgcolor: 'transparent',
        cursor: 'pointer',
        display: 'block',
        lineHeight: 0,
        '&:hover': { opacity: 0.88 },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
          borderRadius: 1,
        },
      }
    : undefined

  const wrapLogo = (variant: 'header' | 'rail', node: ReactNode) => {
    if (!onLogoClick) return node
    const testId = variant === 'header' ? 'brand-logo-header' : 'brand-logo-rail'
    return (
      <Tooltip title={`About ${DISPLAY_VISION}`} placement={variant === 'header' ? 'bottom' : 'right'}>
        <Box
          component="button"
          type="button"
          onClick={onLogoClick}
          aria-label={`About ${DISPLAY_VISION}`}
          data-testid={testId}
          sx={variant === 'header' ? { ...logoButtonSx, minWidth: 0 } : logoButtonSx}
        >
          {node}
        </Box>
      </Tooltip>
    )
  }

  const connectionDotSx = {
    stopped: { bgcolor: 'grey.700', boxShadow: 'none' },
    ready: { bgcolor: 'warning.main', boxShadow: '0 0 10px rgba(251, 191, 36, 0.45)' },
    starting: { bgcolor: 'info.main', boxShadow: '0 0 10px rgba(56, 189, 248, 0.45)' },
    live: { bgcolor: 'success.main', boxShadow: '0 0 10px rgba(34, 197, 94, 0.55)' },
  }[connectionTone]

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
      <Paper
        elevation={0}
        square
        className="vision-rail"
        sx={{
          width: VISION_SIDEBAR_W,
          flexShrink: 0,
          alignSelf: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          py: 2,
          px: 0.75,
          gap: 0.5,
          borderRight: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        {wrapLogo('rail', <BrandLogo variant="rail" />)}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: 0 }}>
          {nav.map((item) => {
          const selected = activeTab === item.id
          return (
            <Tooltip key={item.id} title={item.label} placement="right">
              <Stack
                component="button"
                type="button"
                data-testid={`nav-${item.id}`}
                onClick={() => onTabChange(item.id)}
                alignItems="center"
                spacing={0.5}
                sx={{
                  border: 0,
                  cursor: 'pointer',
                  py: 1.25,
                  px: 0.5,
                  borderRadius: 2,
                  bgcolor: selected ? 'action.selected' : 'transparent',
                  color: selected ? 'primary.light' : 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <IconButton
                  size="small"
                  color={selected ? 'primary' : 'default'}
                  sx={{ pointerEvents: 'none' }}
                  tabIndex={-1}
                >
                  {item.icon}
                </IconButton>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.62rem', fontWeight: selected ? 600 : 400, lineHeight: 1.1 }}
                >
                  {item.label}
                </Typography>
              </Stack>
            </Tooltip>
          )
          })}
          {railFooter ? (
            <Box sx={{ flexShrink: 0, mt: 'auto', width: '100%', pt: 0.5 }}>{railFooter}</Box>
          ) : null}
        </Box>
      </Paper>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Paper
          elevation={0}
          square
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            backgroundImage:
              'linear-gradient(180deg, rgba(139, 92, 246, 0.04) 0%, transparent 48%)',
          }}
        >
          <Toolbar variant="dense" sx={{ minHeight: 48, gap: 1.5 }}>
            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
              {wrapLogo('header', <BrandLogo variant="header" />)}
            </Box>
            <Box
              data-testid="connection-status-dot"
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                ...connectionDotSx,
              }}
            />
            {headerExtra}
          </Toolbar>
          <VisionActivityBar
            process={process}
            specJob={specJob}
            liveTiming={liveTiming}
            turnEta={turnEta}
          />
        </Paper>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            p: activeTab === 'editor' ? 0 : 3,
            overflow: activeTab === 'editor' ? 'hidden' : 'auto',
            display: activeTab === 'editor' ? 'flex' : 'block',
            flexDirection: activeTab === 'editor' ? 'column' : undefined,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
