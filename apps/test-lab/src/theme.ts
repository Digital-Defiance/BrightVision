import { createTheme } from '@mui/material/styles'

export const testLabTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#61afef' },
    success: { main: '#98c379' },
    error: { main: '#e06c75' },
    warning: { main: '#e5c07b' },
    background: { default: '#0f1320', paper: '#182033' },
    divider: '#25304a',
  },
  typography: {
    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
  },
  shape: { borderRadius: 8 },
})
