import { Box, Typography } from '@mui/material'
import { useEffect, useId, useRef, useState } from 'react'

interface MermaidFenceProps {
  source: string
  complete: boolean
}

/**
 * Mermaid v11 render() injects a temporary element into the DOM for the given ID.
 * On syntax errors, it creates an error SVG in that element before throwing.
 * We must clean up any orphaned elements to prevent stale error visuals.
 */
function cleanupMermaidOrphans(containerId: string) {
  // Mermaid creates elements with id="{containerId}" or "d{containerId}" in the document body
  const selectors = [`#${containerId}`, `#d${containerId}`, `[data-id="${containerId}"]`]
  for (const sel of selectors) {
    try {
      document.querySelectorAll(sel).forEach((el) => el.remove())
    } catch {
      // invalid selector or missing element — safe to ignore
    }
  }
}

/** True when source looks obviously incomplete (streaming mid-diagram). */
function isLikelyTruncated(source: string): boolean {
  const trimmed = source.trim()
  if (!trimmed) return true
  // Spec truncation markers
  if (/…\s*\(.*truncated/i.test(trimmed)) return true
  if (trimmed.includes('… (')) return true
  // Mermaid diagrams typically end with a complete line — truncated ones often
  // end mid-keyword or with an open bracket/quote/arrow
  const lastChar = trimmed[trimmed.length - 1]
  if (['>', '-', '|', '"', "'", '(', '[', '{'].includes(lastChar)) return true
  // Very short sources with a graph/flowchart keyword but <2 lines are likely still streaming
  const lines = trimmed.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return true
  return false
}

export function MermaidFence({ source, complete }: MermaidFenceProps) {
  const id = useId().replace(/:/g, '')
  const containerId = `vision-mmd-${id}`
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!complete || !source.trim()) {
      setSvg(null)
      setError(null)
      return
    }

    // Skip rendering obviously truncated diagrams to avoid mermaid parse-error spam
    if (isLikelyTruncated(source)) {
      setSvg(null)
      setError(null)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        })
        const { svg: rendered } = await mermaid.render(containerId, source.trim())
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      } catch (err) {
        // Clean up any orphaned mermaid DOM elements injected before the throw
        cleanupMermaidOrphans(containerId)
        if (!cancelled) {
          setSvg(null)
          const raw = err instanceof Error ? err.message : String(err)
          // Strip mermaid version boilerplate for a cleaner message
          const cleaned = raw
            .replace(/mermaid version [\d.]+/gi, '')
            .replace(/Syntax error in text\s*/gi, '')
            .trim()
          setError(cleaned || 'Diagram has a syntax error and cannot be rendered.')
        }
      }
    })()
    return () => {
      cancelled = true
      // Ensure cleanup on unmount/re-render
      cleanupMermaidOrphans(containerId)
    }
  }, [source, complete, containerId])

  if (!complete) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
        Diagram loading…
      </Typography>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 1, border: '1px solid', borderColor: 'warning.main', borderRadius: 1 }}>
        <Typography
          variant="caption"
          color="warning.main"
          component="div"
          sx={{ fontWeight: 500, mb: 0.5 }}
        >
          ⚠ Diagram syntax error
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          component="pre"
          sx={{ whiteSpace: 'pre-wrap', m: 0, fontSize: '0.7rem' }}
        >
          {error}
        </Typography>
      </Box>
    )
  }

  if (!svg) {
    return (
      <Typography variant="caption" color="text.secondary">
        Rendering diagram…
      </Typography>
    )
  }

  return (
    <Box
      ref={containerRef}
      className="vision-chat-mermaid"
      sx={{
        overflow: 'auto',
        maxHeight: 420,
        '& svg': { maxWidth: '100%', height: 'auto' },
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
      data-testid="chat-mermaid-diagram"
    />
  )
}
