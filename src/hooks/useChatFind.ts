import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  clearChatFindHighlights,
  highlightChatFind,
  setActiveChatFindMark,
} from '../utils/chatFindHighlight'

export function useChatFind(
  scrollRef: React.RefObject<HTMLElement | null>,
  /** Re-run highlights when chat content changes. */
  contentRevision: unknown
) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const marksRef = useRef<HTMLElement[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setMatchIndex(0)
    setMatchCount(0)
    marksRef.current = []
    if (scrollRef.current) clearChatFindHighlights(scrollRef.current)
  }, [scrollRef])

  useLayoutEffect(() => {
    const root = scrollRef.current
    if (!root || !open) return
    const marks = highlightChatFind(root, query)
    marksRef.current = marks
    setMatchCount(marks.length)
    setMatchIndex(0)
    if (marks.length > 0) setActiveChatFindMark(marks, 0)
  }, [scrollRef, open, query, contentRevision])

  useLayoutEffect(() => {
    const marks = marksRef.current
    if (!open || marks.length === 0) return
    const idx = Math.min(matchIndex, marks.length - 1)
    setActiveChatFindMark(marks, idx)
  }, [open, matchIndex])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setOpen(true)
        return
      }
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  const goNext = useCallback(() => {
    const marks = marksRef.current
    if (marks.length === 0) return
    setMatchIndex((i) => (i + 1) % marks.length)
  }, [])

  const goPrev = useCallback(() => {
    const marks = marksRef.current
    if (marks.length === 0) return
    setMatchIndex((i) => (i - 1 + marks.length) % marks.length)
  }, [])

  return {
    open,
    query,
    matchIndex,
    matchCount,
    inputRef,
    setOpen,
    setQuery,
    close,
    goNext,
    goPrev,
  }
}
