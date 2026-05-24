import { Box, IconButton, Paper, Stack, Toolbar, Tooltip, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { BrandLogo } from '../brand/BrandLogo'
import type { ProcessSnapshot } from '../../progress/types'
import { VisionActivityBar } from '../progress/VisionActivityBar'

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
  isRunning: boolean
  headerExtra?: ReactNode
  children: ReactNode
}

const SIDEBAR_W = 92

export function AppChrome({
  nav,
  activeTab,
  onTabChange,
  process,
  isRunning,
  headerExtra,
  children,
}: AppChromeProps) {
  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
      <Paper
        elevation={0}
        square
        className="vision-rail"
        sx={{
          width: SIDEBAR_W,
          flexShrink: 0,
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
        <BrandLogo variant="rail" />
        {nav.map((item) => {
          const selected = activeTab === item.id
          return (
            <Tooltip key={item.id} title={item.label} placement="right">
              <Stack
                component="button"
                type="button"
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
              <BrandLogo variant="header" />
            </Box>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: isRunning ? 'success.main' : 'grey.700',
                boxShadow: isRunning ? '0 0 10px rgba(34, 197, 94, 0.55)' : 'none',
              }}
            />
            {headerExtra}
          </Toolbar>
          <VisionActivityBar process={process} />
        </Paper>

        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>{children}</Box>
      </Box>
    </Box>
  )
}
