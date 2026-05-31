import { useLayoutEffect, useRef } from 'react'
import { Box } from '@mui/material'

const BOTTOM_THRESHOLD_PX = 24

type StepLogPanelProps = {
  lines: string[]
}

/** Tail -f style scroll: follow new lines only while pinned to the bottom. */
export default function StepLogPanel({ lines }: StepLogPanelProps) {
  const scrollRef = useRef<HTMLPreElement>(null)
  const pinnedRef = useRef(true)

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

  return (
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
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      {lines.length ? lines.join('\n') : '(no output yet)'}
    </Box>
  )
}
