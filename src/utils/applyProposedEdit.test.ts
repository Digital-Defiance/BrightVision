import { describe, expect, it } from 'vitest'
import {
  applySearchReplaceToContent,
  parseSearchReplacePairs,
  resolveProposedEditPath,
} from './applyProposedEdit'

describe('applyProposedEdit', () => {
  it('parses SEARCH/REPLACE pairs', () => {
    const body = `<<<<<<< SEARCH
old line
=======
new line
>>>>>>> REPLACE`
    const pairs = parseSearchReplacePairs(body)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].search.trim()).toBe('old line')
    expect(pairs[0].replace.trim()).toBe('new line')
  })

  it('applies exact search replace', () => {
    const out = applySearchReplaceToContent('aaa\nold line\nbbb', 'old line\n', 'new line\n')
    expect(out).toContain('new line')
    expect(out).not.toContain('old line')
  })

  it('applies when search block differs only by leading indent', () => {
    const content = '  function foo() {\n    return 1;\n  }\n'
    const search = 'function foo() {\n  return 1;\n}\n'
    const replace = 'function foo() {\n  return 2;\n}\n'
    const out = applySearchReplaceToContent(content, search, replace)
    expect(out).toContain('return 2')
    expect(out).not.toContain('return 1')
    expect(out?.startsWith('  function')).toBe(true)
  })

  it('applies single-line search when file line differs only by indent', () => {
    const out = applySearchReplaceToContent('  const x = 1;\n', 'const x = 1;', 'const x = 2;')
    expect(out).toBe('  const x = 2;\n')
  })

  it('applies when search block differs only by trailing spaces per line', () => {
    const content = 'function foo() {\n  return 1;\n}\n'
    const search = 'function foo() {\n  return 1; \n}\n'
    const replace = 'function foo() {\n  return 2;\n}\n'
    const out = applySearchReplaceToContent(content, search, replace)
    expect(out).toContain('return 2')
    expect(out).not.toContain('return 1')
  })

  it('resolves path from title', () => {
    expect(resolveProposedEditPath('src/foo.ts', '', '')).toBe('src/foo.ts')
  })

  it('applies multiple SEARCH/REPLACE pairs in order', () => {
    const body = `<<<<<<< SEARCH
a
=======
A
>>>>>>> REPLACE
<<<<<<< SEARCH
b
=======
B
>>>>>>> REPLACE`
    const pairs = parseSearchReplacePairs(body)
    let content = 'a\nb\n'
    for (const { search, replace } of pairs) {
      const next = applySearchReplaceToContent(content, search, replace)
      expect(next).not.toBeNull()
      content = next!
    }
    expect(content).toBe('A\nB\n')
  })
})
