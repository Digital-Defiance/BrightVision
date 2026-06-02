import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_PROJECT_KEY,
  loadCurrentProject,
  loadRecentProjects,
  projectDisplayName,
  recordRecentProject,
  saveCurrentProject,
} from './openProject'

function mockLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  })
}

describe('openProject storage', () => {
  beforeEach(() => {
    mockLocalStorage()
  })

  it('saves and loads current project', () => {
    saveCurrentProject('/Volumes/Code/foo/')
    expect(loadCurrentProject()).toBe('/Volumes/Code/foo')
    expect(localStorage.getItem(CURRENT_PROJECT_KEY)).toBe('/Volumes/Code/foo')
  })

  it('records recents without duplicates', () => {
    recordRecentProject('/a')
    recordRecentProject('/b')
    recordRecentProject('/a')
    expect(loadRecentProjects()).toEqual(['/a', '/b'])
  })

  it('display name uses last path segment', () => {
    expect(projectDisplayName('/Volumes/Code/brightdate-rust')).toBe('brightdate-rust')
  })
})
