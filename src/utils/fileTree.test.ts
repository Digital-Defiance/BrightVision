import { describe, expect, it } from 'vitest'
import { buildFileTree, filterFileTree } from './fileTree'

describe('fileTree', () => {
  it('builds nested tree from paths', () => {
    const tree = buildFileTree(['src/App.tsx', 'src/utils/foo.ts', 'README.md'])
    expect(tree.some((n) => n.name === 'README.md')).toBe(true)
    const src = tree.find((n) => n.name === 'src')
    expect(src?.isDir).toBe(true)
    expect(src?.children?.some((c) => c.name === 'App.tsx')).toBe(true)
  })

  it('filters by query', () => {
    const tree = buildFileTree(['src/App.tsx', 'src/utils/foo.ts'])
    const filtered = filterFileTree(tree, 'app')
    const flat = JSON.stringify(filtered)
    expect(flat.toLowerCase()).toContain('app.tsx')
  })
})
