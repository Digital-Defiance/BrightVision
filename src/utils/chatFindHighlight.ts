export const CHAT_FIND_MARK = 'vision-chat-find-mark'
export const CHAT_FIND_MARK_ACTIVE = 'vision-chat-find-mark-active'

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement
  if (!parent) return true
  if (parent.closest('[data-chat-find-skip]')) return true
  if (parent.closest(`.${CHAT_FIND_MARK}`)) return true
  const tag = parent.tagName
  if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SCRIPT' || tag === 'STYLE') return true
  return false
}

/** Wrap case-insensitive matches in *root*; returns mark elements in document order. */
export function highlightChatFind(root: HTMLElement, query: string): HTMLElement[] {
  clearChatFindHighlights(root)
  const needle = query.trim()
  if (!needle) return []

  const marks: HTMLElement[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (shouldSkipTextNode(node)) continue
    if (!node.nodeValue?.trim()) continue
    textNodes.push(node)
  }

  const lowerNeedle = needle.toLowerCase()
  for (const node of textNodes) {
    const value = node.nodeValue ?? ''
    const lower = value.toLowerCase()
    let start = 0
    let index = lower.indexOf(lowerNeedle, start)
    if (index === -1) continue

    const frag = document.createDocumentFragment()
    while (index !== -1) {
      if (index > start) {
        frag.appendChild(document.createTextNode(value.slice(start, index)))
      }
      const mark = document.createElement('mark')
      mark.className = CHAT_FIND_MARK
      mark.textContent = value.slice(index, index + needle.length)
      frag.appendChild(mark)
      marks.push(mark)
      start = index + needle.length
      index = lower.indexOf(lowerNeedle, start)
    }
    if (start < value.length) {
      frag.appendChild(document.createTextNode(value.slice(start)))
    }
    node.parentNode?.replaceChild(frag, node)
  }
  return marks
}

export function clearChatFindHighlights(root: HTMLElement): void {
  root.querySelectorAll(`.${CHAT_FIND_MARK}`).forEach((el) => {
    const mark = el as HTMLElement
    const text = document.createTextNode(mark.textContent ?? '')
    mark.replaceWith(text)
  })
  root.normalize()
}

export function setActiveChatFindMark(marks: HTMLElement[], index: number): void {
  marks.forEach((m, i) => {
    if (i === index) m.classList.add(CHAT_FIND_MARK_ACTIVE)
    else m.classList.remove(CHAT_FIND_MARK_ACTIVE)
  })
  const active = marks[index]
  if (active) {
    active.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}
