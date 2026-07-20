import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LLM_E2E_FILE_ORDER } from '../../../e2e/llm-suite-order'
import { E2E_LLM_PLAYWRIGHT_SUBSTEPS, LLM_CORE_PYTEST_SUBSTEPS } from './substepManifest'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function orderedPyFilesFromSubsteps(nodes: readonly string[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    const file = node.split('::')[0] ?? node
    if (!out.length || out[out.length - 1] !== file) out.push(file)
  }
  return out
}

function llmCoreFilesFromManifestPy(): string[] {
  const text = readFileSync(
    join(repoRoot, 'bright_vision_core/test_suite/manifest.py'),
    'utf8'
  )
  const marker = '_LLM_CORE_TEST_FILES: tuple[str, ...] = ('
  const start = text.indexOf(marker)
  if (start < 0) throw new Error('missing _LLM_CORE_TEST_FILES in manifest.py')
  let depth = 1
  let i = start + marker.length
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth--
  }
  const block = text.slice(start + marker.length, i - 1)
  return [...block.matchAll(/"([^"]+\.py)"/g)].map((m) => m[1]!)
}

describe('substepManifest', () => {
  it('llm:core substeps cover every manifest file in order', () => {
    expect(orderedPyFilesFromSubsteps(LLM_CORE_PYTEST_SUBSTEPS)).toEqual(
      llmCoreFilesFromManifestPy()
    )
  })

  it('e2e:llm substeps match llm-suite-order.ts', () => {
    expect([...E2E_LLM_PLAYWRIGHT_SUBSTEPS]).toEqual([...LLM_E2E_FILE_ORDER])
  })
})
