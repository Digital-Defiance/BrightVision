import { useLayoutEffect, useRef, useState } from 'react'
import { Box, Button, Stack } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'

const BOTTOM_THRESHOLD_PX = 24
const MAX_LINES = 2000

export type StepLogStatus = 'pending' | 'running' | 'ok' | 'fail' | 'skipped'

type StepLogPanelProps = {
  lines: string[]
  stepLabel?: string
  stepStatus?: StepLogStatus
}

/** Tail -f style scroll: follow new lines only while pinned to the bottom. */
export default function StepLogPanel({ lines, stepLabel, stepStatus = 'pending' }: StepLogPanelProps) {
/** Copy once the step has left the gray hourglass (pending) state — matches the accordion status icon. */
  const showCopy = stepStatus !== 'pending'
  const scrollRef = useRef<HTMLPreElement>(null)
  const pinnedRef = useRef(true)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  const updatePinned = () => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distanceFromBottom <= BOTTOM_THRESHOLD_PX
  }

  useLayoutEffect(() => {
    if (lines.length === 0) {
      pinnedRef.current = true
      return
    }
    const el = scrollRef.current
    if (!el || !pinnedRef.current) return
    el.scrollTop = el.scrollHeight
  }, [lines])

  const handleCopy = async () => {
    if (!lines.length) return
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopyMsg('Copied')
      window.setTimeout(() => setCopyMsg(null), 2000)
    } catch {
      setCopyMsg('Copy failed')
    }
  }

  return (
    <Box>
      {showCopy && (
        <Stack direction="row" spacing={1} sx={{ px: 1, py: 0.5, borderTop: 1, borderColor: 'divider' }}>
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            disabled={!lines.length}
            onClick={() => void handleCopy()}
          >
            Copy step log
          </Button>
          {copyMsg && (
            <Box component="span" sx={{ fontSize: 12, color: 'success.main', alignSelf: 'center' }}>
              {copyMsg}
            </Box>
          )}
        </Stack>
      )}
      <Box
        component="pre"
        ref={scrollRef}
        onScroll={updatePinned}
        sx={{
          m: 0,
          p: 1.5,
          maxHeight: 280,
          overflow: 'auto',
          fontSize: 11,
          bgcolor: '#0a0d18',
        }}
      >
        {lines.length
          ? lines.join('\n')
          : stepLabel
            ? `(no output yet for ${stepLabel})`
            : '(no output yet)'}
      </Box>
    </Box>
  )
}

export { MAX_LINES as STEP_LOG_MAX_LINES }
