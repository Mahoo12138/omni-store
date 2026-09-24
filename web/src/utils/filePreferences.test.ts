import { describe, expect, it } from 'vitest'
import { readFilePreferences, writeFilePreferences, type FilePreferences } from './filePreferences'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('file preferences', () => {
  it('uses defaults when a source has no saved preferences', () => {
    expect(readFilePreferences('team', memoryStorage())).toEqual({
      view: 'list', pageSize: 20, sort: 'name', order: 'asc',
    })
  })

  it('round-trips valid values and keeps preferences isolated per source', () => {
    const storage = memoryStorage()
    const chosen: FilePreferences = { view: 'grid', pageSize: 100, sort: 'mtime', order: 'desc' }
    writeFilePreferences('team', chosen, storage)

    expect(readFilePreferences('team', storage)).toEqual(chosen)
    expect(readFilePreferences('public', storage)).toEqual({
      view: 'list', pageSize: 20, sort: 'name', order: 'asc',
    })
  })

  it('recovers from malformed and unsupported persisted values field-by-field', () => {
    const storage = memoryStorage({
      'omnistore:file-preferences:broken': '{',
      'omnistore:file-preferences:invalid': JSON.stringify({ view: 'table', pageSize: 999, sort: 'random', order: 'sideways' }),
      'omnistore:file-preferences:partial': JSON.stringify({ view: 'grid', pageSize: 50 }),
    })

    expect(readFilePreferences('broken', storage)).toEqual({ view: 'list', pageSize: 20, sort: 'name', order: 'asc' })
    expect(readFilePreferences('invalid', storage)).toEqual({ view: 'list', pageSize: 20, sort: 'name', order: 'asc' })
    expect(readFilePreferences('partial', storage)).toEqual({ view: 'grid', pageSize: 50, sort: 'name', order: 'asc' })
  })

  it('does not throw when storage is unavailable', () => {
    const brokenStorage = {
      getItem: () => { throw new Error('storage disabled') },
      setItem: () => { throw new Error('quota exceeded') },
    }
    expect(readFilePreferences('team', brokenStorage)).toEqual({
      view: 'list', pageSize: 20, sort: 'name', order: 'asc',
    })
    expect(() => writeFilePreferences('team', { view: 'grid', pageSize: 20, sort: 'size', order: 'asc' }, brokenStorage)).not.toThrow()
  })
})
