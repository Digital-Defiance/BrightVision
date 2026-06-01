import { describe, expect, it } from 'vitest'
import { isRedundantEditToolOutput } from './suppressDuplicateToolOutput'

describe('isRedundantEditToolOutput', () => {
  const block = `<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE`

  it('detects duplicate edit echo in tool output', () => {
    expect(
      isRedundantEditToolOutput(
        `# 1 failed\n${block}`,
        `Answer:\n\`\`\`\n${block}\n\`\`\``
      )
    ).toBe(true)
  })

  it('keeps unrelated tool output', () => {
    expect(isRedundantEditToolOutput('Applied edits to foo.ts', block)).toBe(false)
  })
})
