export type FileSortKey = 'name' | 'size' | 'mtime'
export type FileSortOrder = 'asc' | 'desc'
export type FileViewMode = 'list' | 'grid'

export interface FilePreferences {
  view: FileViewMode
  pageSize: 20 | 50 | 100
  sort: FileSortKey
  order: FileSortOrder
}

const defaults: FilePreferences = { view: 'list', pageSize: 20, sort: 'name', order: 'asc' }
const keyPrefix = 'omnistore:file-preferences:'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function readFilePreferences(sourceKey: string, storage?: StorageLike): FilePreferences {
  try {
    const raw = (storage ?? window.localStorage).getItem(keyPrefix + sourceKey)
    if (!raw) return { ...defaults }
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return { ...defaults }
    const record = value as Record<string, unknown>
    return {
      view: record.view === 'grid' ? 'grid' : 'list',
      pageSize: record.pageSize === 50 || record.pageSize === 100 ? record.pageSize : 20,
      sort: record.sort === 'size' || record.sort === 'mtime' ? record.sort : 'name',
      order: record.order === 'desc' ? 'desc' : 'asc',
    }
  } catch {
    return { ...defaults }
  }
}

export function writeFilePreferences(sourceKey: string, preferences: FilePreferences, storage?: StorageLike): void {
  try {
    ;(storage ?? window.localStorage).setItem(keyPrefix + sourceKey, JSON.stringify(preferences))
  } catch {
    // Preferences are a convenience; disabled/quota-limited storage must not break file browsing.
  }
}
