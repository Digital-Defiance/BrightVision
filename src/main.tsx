import React from 'react'
import ReactDOM from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import App from './App'
import { ProcessProvider } from './progress/processStore'
import { visionTheme } from './theme'
import './styles/global.scss'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={visionTheme}>
      <CssBaseline />
      <ProcessProvider>
        <App />
      </ProcessProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
