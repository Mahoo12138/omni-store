import { apiFetch } from './client'
import type { FileListResult } from './sources'

export interface FileShare {
  key: string
  source_key: string
  source_name: string
  path: string
  name: string
  type: 'file' | 'dir'
  protected: boolean
  created_by_name: string
  expires_at?: string
  max_downloads: number
  download_count: number
  in_trash: boolean
  last_accessed_at?: string
  created_at: string
  url: string
}

export interface PublicShareInfo {
  key: string
  name: string
  type: 'file' | 'dir'
  protected: boolean
  access_granted: boolean
  expires_at?: string
  max_downloads: number
  download_count: number
}

export async function fetchShares(): Promise<FileShare[]> {
  const data = await apiFetch<{ items: FileShare[]; total: number }>('/api/v1/shares')
  return data.items ?? []
}

export async function createShare(input: {
  sourceKey: string
  path: string
  password?: string
  expiresAt?: string
  maxDownloads?: number
}): Promise<FileShare> {
  return apiFetch('/api/v1/shares', {
    method: 'POST',
    body: JSON.stringify({
      source_key: input.sourceKey,
      path: input.path,
      password: input.password ?? '',
      expires_at: input.expiresAt || null,
      max_downloads: input.maxDownloads ?? 0,
    }),
  })
}

export async function revokeShare(key: string): Promise<void> {
  await apiFetch(`/api/v1/shares/${encodeURIComponent(key)}`, { method: 'DELETE' })
}

export function fetchPublicShare(key: string): Promise<PublicShareInfo> {
  return apiFetch(`/api/v1/public/shares/${encodeURIComponent(key)}`)
}

export async function unlockPublicShare(key: string, password: string): Promise<void> {
  await apiFetch(`/api/v1/public/shares/${encodeURIComponent(key)}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export function browsePublicShare(key: string, path: string, page = 1): Promise<FileListResult> {
  const query = new URLSearchParams({ path, page: String(page), page_size: '50' })
  return apiFetch(`/api/v1/public/shares/${encodeURIComponent(key)}/browse?${query}`)
}

export function publicShareRawUrl(key: string, childPath = '', download = false): string {
  const encodedPath = childPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  const base = `/share/${encodeURIComponent(key)}/raw${encodedPath ? `/${encodedPath}` : ''}`
  return download ? `${base}?download=1` : base
}
