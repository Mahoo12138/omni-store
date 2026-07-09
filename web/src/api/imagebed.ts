import { apiFetch } from './client'
import type { UserSource } from './sources'

export interface ImageRecord {
  id: number
  image_id: string
  owner_type: 'user' | 'anonymous'
  source_id: string
  relative_path: string
  original_filename: string
  public_url: string
  size: number
  mime_type: string
  width: number
  height: number
  ext: string
  created_at: string
}

export async function fetchImageBedTargets(): Promise<{
  targets: UserSource[]
  default_source_id: string
}> {
  return apiFetch('/api/v1/image-bed/targets')
}

export async function setDefaultImageBedTarget(sourceId: string): Promise<void> {
  await apiFetch('/api/v1/image-bed/default-target', {
    method: 'PUT',
    body: JSON.stringify({ source_id: sourceId }),
  })
}

export async function uploadImage(file: File, sourceId?: string): Promise<ImageRecord> {
  const form = new FormData()
  form.append('file', file)
  const q = sourceId ? `?source_id=${encodeURIComponent(sourceId)}` : ''
  return apiFetch(`/api/v1/image-bed/uploads${q}`, { method: 'POST', body: form })
}

export async function fetchImageHistory(page = 1, pageSize = 50): Promise<{
  items: ImageRecord[]
  total: number
}> {
  return apiFetch(`/api/v1/image-bed/images?page=${page}&page_size=${pageSize}`)
}

export async function deleteImage(imageId: string): Promise<void> {
  await apiFetch(`/api/v1/image-bed/images/${encodeURIComponent(imageId)}`, { method: 'DELETE' })
}

export async function fetchAnonymousStatus(): Promise<{
  enabled: boolean
  max_file_size_mb: number
}> {
  return apiFetch('/api/v1/image-bed/anonymous-status')
}

export async function uploadAnonymousImage(file: File): Promise<{ url: string }> {
  const form = new FormData()
  form.append('file', file)
  return apiFetch('/api/v1/image-bed/anonymous-upload', { method: 'POST', body: form })
}

export interface TokenStatus {
  exists: boolean
  created_at: string | null
  last_used_at: string | null
}

export async function fetchTokenStatus(): Promise<Record<'webdav' | 'image_bed', TokenStatus>> {
  return apiFetch('/api/v1/me/tokens')
}

export async function resetToken(type: 'webdav' | 'image-bed'): Promise<{ token: string }> {
  return apiFetch(`/api/v1/me/tokens/${type}/reset`, { method: 'POST' })
}
