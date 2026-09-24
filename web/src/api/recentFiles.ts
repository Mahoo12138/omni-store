import { apiFetch } from './client'

export interface RecentFile {
  id: number
  source_key: string
  source_name: string
  path: string
  name: string
  size: number
  modified_at: string
  accessed_at: string
}

export async function fetchRecentFiles(limit = 50): Promise<RecentFile[]> {
  const data = await apiFetch<{ items: RecentFile[]; total: number }>(
    `/api/v1/me/recent-files?limit=${limit}`,
  )
  return data.items ?? []
}
