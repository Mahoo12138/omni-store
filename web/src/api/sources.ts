import { apiFetch } from './client'

export interface UserSource {
  key: string
  name: string
  description: string
  permission: 'read_only' | 'read_write'
  public_read_enabled: boolean
  public_mount_path: string
  webdav_enabled: boolean
  image_bed_enabled: boolean
}

export interface FileEntry {
  name: string
  type: 'dir' | 'file' | 'unsupported'
  size: number
  mtime: string
}

export interface FileListResult {
  items: FileEntry[]
  page: number
  page_size: number
  total: number
  has_next: boolean
}

export async function fetchMySources(): Promise<UserSource[]> {
  const data = await apiFetch<{ items: UserSource[]; total: number }>('/api/v1/sources')
  return data.items ?? []
}

export interface ListFilesParams {
  path: string
  page?: number
  pageSize?: number
  sort?: string
  order?: string
}

export async function listFiles(sourceKey: string, params: ListFilesParams): Promise<FileListResult> {
  const q = new URLSearchParams({ path: params.path })
  if (params.page) q.set('page', String(params.page))
  if (params.pageSize) q.set('page_size', String(params.pageSize))
  if (params.sort) q.set('sort', params.sort)
  if (params.order) q.set('order', params.order)
  return apiFetch(`/api/v1/sources/${encodeURIComponent(sourceKey)}/files?${q}`)
}

export function downloadFileUrl(sourceKey: string, path: string): string {
  return `/api/v1/sources/${encodeURIComponent(sourceKey)}/download?path=${encodeURIComponent(path)}`
}

export async function createFolder(sourceKey: string, path: string, name: string): Promise<void> {
  await apiFetch(`/api/v1/sources/${encodeURIComponent(sourceKey)}/folders`, {
    method: 'POST',
    body: JSON.stringify({ path, name }),
  })
}

export async function uploadFile(
  sourceKey: string,
  path: string,
  file: File,
  overwrite = false,
): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const q = new URLSearchParams({ path })
  if (overwrite) q.set('overwrite', 'true')
  await apiFetch(`/api/v1/sources/${encodeURIComponent(sourceKey)}/upload?${q}`, {
    method: 'POST',
    body: form,
  })
}

export async function deleteFile(sourceKey: string, path: string): Promise<void> {
  await apiFetch(
    `/api/v1/sources/${encodeURIComponent(sourceKey)}/files?path=${encodeURIComponent(path)}`,
    { method: 'DELETE' },
  )
}

export async function renameFile(sourceKey: string, path: string, newName: string): Promise<void> {
  await apiFetch(`/api/v1/sources/${encodeURIComponent(sourceKey)}/files/rename`, {
    method: 'POST',
    body: JSON.stringify({ path, new_name: newName }),
  })
}

export async function moveFile(sourceKey: string, path: string, targetPath: string): Promise<void> {
  await apiFetch(`/api/v1/sources/${encodeURIComponent(sourceKey)}/files/move`, {
    method: 'POST',
    body: JSON.stringify({ path, target_path: targetPath }),
  })
}
