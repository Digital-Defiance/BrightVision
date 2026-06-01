import { Box, Chip, Stack, Typography } from '@mui/material'
import { splitAssistantSections } from '../../utils/chatStream'
import {
  formatDurationMs,
  sectionDurationByIndex,
  type TurnThinkingTiming,
} from '../../utils/thinkingTiming'
import {
  isProposedEditApplied,
  parseAssistantContent,
  type AssistantContentSegment,
} from '../../utils/proposedEdits'
import { ChatFenceBlock } from './ChatFenceBlock'
import { ChatMarkdown } from './ChatMarkdown'
import { ProposedEditBlock } from './ProposedEditBlock'

function sectionLabel(kind: string, durationMs?: number): string {
  let base = ''
  if (kind === 'thinking') base = 'Thinking'
  else if (kind === 'answer') base = 'Answer'
  else if (kind === 'reasoning') base = 'Reasoning'
  if (!base) return ''
  if (durationMs !== undefined && durationMs > 0) {
    return `${base} · ${formatDurationMs(durationMs)}`
  }
  return base
}

function renderSegment(
  seg: AssistantContentSegment,
  key: string,
  appliedFiles: string[],
  opts: {
    canApply?: boolean
    onApply?: (segment: Extract<AssistantContentSegment, { type: 'proposed_edit' }>) => Promise<void>
    onOpenInEditor?: (path: string) => void
  }
) {
  if (seg.type === 'prose') {
    const text = seg.content.trim()
    if (!text) return null
    return <ChatMarkdown key={key} content={seg.content} />
  }
  if (seg.type === 'display_fence') {
    return (
      <ChatFenceBlock
        key={key}
        language={seg.language}
        body={seg.body}
        complete={seg.complete}
      />
    )
  }
  const applied = isProposedEditApplied(seg.title, appliedFiles)
  return (
    <ProposedEditBlock
      key={key}
      segment={seg}
      applied={applied}
      defaultExpanded={!applied && seg.kind === 'search_replace'}
      canApply={opts.canApply}
      onApply={opts.onApply ? () => opts.onApply!(seg) : undefined}
      onOpenInEditor={opts.onOpenInEditor}
    />
  )
}

interface AssistantMessageBodyProps {
  content: string
  appliedFiles?: string[]
  onOpenInEditor?: (path: string) => void
  canApplyEdits?: boolean
  onApplyProposedEdit?: (
    segment: Extract<AssistantContentSegment, { type: 'proposed_edit' }>
  ) => Promise<void>
  turnTiming?: TurnThinkingTiming
  showSectionDurations?: boolean
  showTurnTotal?: boolean
}

export function AssistantMessageBody({
  content,
  appliedFiles = [],
  onOpenInEditor,
  canApplyEdits = false,
  onApplyProposedEdit,
  turnTiming,
  showSectionDurations = true,
  showTurnTotal = true,
}: AssistantMessageBodyProps) {
  const segmentOpts = {
    canApply: canApplyEdits,
    onApply: onApplyProposedEdit,
    onOpenInEditor,
  }
  const sections = splitAssistantSections(content)
  const durationByIndex =
    turnTiming && showSectionDurations
      ? sectionDurationByIndex(sections, turnTiming.sections)
      : new Map<number, number>()

  return (
    <Stack spacing={1} sx={{ pr: 3 }}>
      {showTurnTotal && turnTiming && turnTiming.turnDurationMs > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="message-turn-timing"
          sx={{ fontFamily: 'var(--vision-font-chat, monospace)', fontSize: '0.7rem' }}
        >
          Response {formatDurationMs(turnTiming.turnDurationMs)}
          {turnTiming.thoughtMs > 0 && ` · Think ${formatDurationMs(turnTiming.thoughtMs)}`}
        </Typography>
      )}
      {appliedFiles.length > 0 && onOpenInEditor && (
        <Stack direction="row" flexWrap="wrap" gap={0.5} useFlexGap alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Edited:
          </Typography>
          {appliedFiles.map((path) => (
            <Chip
              key={path}
              size="small"
              label={path}
              clickable
              onClick={() => onOpenInEditor(path)}
              data-testid={`applied-file-open-${path.replace(/\//g, '--')}`}
              sx={{ '& .MuiChip-label': { fontFamily: 'monospace', fontSize: '0.7rem' } }}
            />
          ))}
        </Stack>
      )}
      {sections.map((sec, si) => (
        <Box key={si}>
          {sectionLabel(sec.kind, durationByIndex.get(si)) && (
            <Chip
              label={sectionLabel(sec.kind, durationByIndex.get(si))}
              size="small"
              variant="outlined"
              sx={{ mb: 0.5, fontSize: '0.7rem' }}
            />
          )}
          <Stack spacing={1}>
            {parseAssistantContent(sec.content).map((seg, i) =>
              renderSegment(seg, `${si}-${i}`, appliedFiles, segmentOpts)
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  )
}
