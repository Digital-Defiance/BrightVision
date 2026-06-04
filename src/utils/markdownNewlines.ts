/**
 * Markdown collapses single newlines; preserve them outside fenced blocks as hard breaks.
 */
export function withMarkdownHardBreaks(content: string): string {
  const parts = content.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part.replace(/(?<!\n)\n(?!\n)/g, '  \n')
    })
    .join('')
}
