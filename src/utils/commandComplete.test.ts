import { describe, expect, it } from 'vitest'
import { buildDefaultCommandCatalog } from '../ipc/commands'
import { filterSlashCommandSuggestions, nextSlashCommandCompletion } from './commandComplete'

describe('filterSlashCommandSuggestions', () => {
  const commands = buildDefaultCommandCatalog()

  it('includes /agent in default catalog', () => {
    expect(commands.some((c) => c.name === '/agent')).toBe(true)
  })

  it('lists /agent for /ag prefix', () => {
    const hits = filterSlashCommandSuggestions(commands, '/ag')
    expect(hits.some((c) => c.name === '/agent')).toBe(true)
  })

  it('includes /agent in first page when typing /', () => {
    const hits = filterSlashCommandSuggestions(commands, '/')
    expect(hits.some((c) => c.name === '/agent')).toBe(true)
  })
})

describe('nextSlashCommandCompletion', () => {
  const commands = buildDefaultCommandCatalog()

  it('extends /ag toward /agent', () => {
    expect(nextSlashCommandCompletion(commands, '/ag', 0)).toBe('/agent')
  })

  it('cycles /a matches so /agent is reachable via Tab', () => {
    expect(nextSlashCommandCompletion(commands, '/a', 0)).toBe('/add')
    expect(nextSlashCommandCompletion(commands, '/a', 1)).toBe('/agent')
  })
})
