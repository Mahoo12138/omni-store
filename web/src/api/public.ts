import { apiFetch } from './client'
import type { FileListResult } from './sources'

export interface PublicSummary {
  enabled: boolean
  source_key?: string
  source_name?: string
}

export async function fetchPublicSummary(): Promise<PublicSummary> {
  return apiFetch<PublicSummary>('/api/v1/public/summary')
}

export async function browsePublic(path: string, page = 1): Promise<FileListResult> {
  const q = new URLSearchParams({ path, page: String(page) })
  return apiFetch(`/api/v1/public/browse?${q}`)
}

export function rawUrl(virtualPath: string, download = false): string {
  const clean = virtualPath.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return `/public/raw/${clean}${download ? '?download=1' : ''}`
}
