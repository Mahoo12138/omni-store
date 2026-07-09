import { apiFetch } from './client'
import type { FileListResult } from './sources'

export interface PublicMount {
  mount_path: string
  name: string
  description: string
}

export async function fetchPublicMounts(): Promise<PublicMount[]> {
  const data = await apiFetch<{ items: PublicMount[]; total: number }>('/api/v1/public/mounts')
  return data.items ?? []
}

export async function browsePublic(path: string, page = 1): Promise<FileListResult> {
  const q = new URLSearchParams({ path, page: String(page) })
  return apiFetch(`/api/v1/public/browse?${q}`)
}

export function rawUrl(virtualPath: string, download = false): string {
  const clean = virtualPath.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return `/raw/${clean}${download ? '?download=1' : ''}`
}
