import { describe, expect, it } from 'vitest'
import {
  looksLikeAgentJson,
  parseAgentJsonText,
  parseJsonToolText,
  parseStrictJsonDocument,
  splitConcatenatedJson,
  tryParseLenientObject,
} from './jsonParse'

describe('splitConcatenatedJson', () => {
  it('splits glued objects', () => {
    expect(splitConcatenatedJson('{"limit": 15}{"path": "."}')).toEqual([
      '{"limit": 15}',
      '{"path": "."}',
    ])
  })
})

describe('tryParseLenientObject', () => {
  it('parses simple path object', () => {
    expect(tryParseLenientObject('{ "path": "curl-reference-code" }')).toEqual({
      path: 'curl-reference-code',
    })
  })
})

describe('parseAgentJsonText', () => {
  it('parses single object', () => {
    expect(parseAgentJsonText('{"path": "src"}')).toEqual({ path: 'src' })
  })

  it('parses path-only glued fragment', () => {
    expect(parseAgentJsonText('{ "path": "curl-reference-code" }')).toEqual({
      path: 'curl-reference-code',
    })
  })

  it('merges glued objects', () => {
    expect(parseAgentJsonText('{"limit": 15}{"path": "."}')).toEqual({ limit: 15, path: '.' })
  })

  it('merges broken tasks array with path fragment', () => {
    const raw =
      '{ "tasks": "[{"done": true, "task": "Explore"}, {"done": false, "task": "Review"}]" }{ "path": "curl-reference-code" }'
    expect(parseAgentJsonText(raw)).toEqual({
      tasks: [
        { done: true, task: 'Explore' },
        { done: false, task: 'Review' },
      ],
      path: 'curl-reference-code',
    })
  })

  it('parses markdown-fenced JSON', () => {
    expect(parseAgentJsonText('```json\n{ "path": "src/lib" }\n```')).toEqual({ path: 'src/lib' })
  })

  it('returns null for plain prose', () => {
    expect(parseAgentJsonText('Hello from the agent')).toBeNull()
  })

  it('returns null for top-level string literal', () => {
    expect(parseAgentJsonText('"curl-reference-code"')).toBeNull()
    expect(parseStrictJsonDocument('"curl-reference-code"')).toBeNull()
  })

  it('returns null for top-level number or boolean', () => {
    expect(parseAgentJsonText('42')).toBeNull()
    expect(parseAgentJsonText('true')).toBeNull()
    expect(parseAgentJsonText('null')).toBeNull()
  })

  it('strict path for valid object with outer whitespace', () => {
    expect(parseStrictJsonDocument('  { "path": "src" }  ')).toEqual({ path: 'src' })
  })

  it('rejects JSON followed by extra text', () => {
    expect(parseStrictJsonDocument('{ "path": "src" }\nextra')).toBeNull()
  })

  it('parseJsonToolText alias works', () => {
    expect(parseJsonToolText('{ "path": "x" }')).toEqual({ path: 'x' })
  })
})

describe('looksLikeAgentJson', () => {
  it('detects path JSON', () => {
    expect(looksLikeAgentJson('{ "path": "curl-reference-code" }')).toBe(true)
  })

  it('detects glued tool args', () => {
    expect(looksLikeAgentJson('{"limit": 5}{"path": "src"}')).toBe(true)
  })

  it('rejects prose', () => {
    expect(looksLikeAgentJson('not json')).toBe(false)
  })

  it('rejects top-level string literal', () => {
    expect(looksLikeAgentJson('"src/lib.rs"')).toBe(false)
  })
})
