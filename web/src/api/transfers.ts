import { apiFetch, ApiRequestError } from './client'
import type { FileListResult } from './sources'

// --- 流转中心（2.0 Phase 4/5/6） ---

export interface TransferSend {
  id: number
  public_key: string
  owner_user_id: number
  source_key: string
  source_name: string
  title: string
  description: string
  has_password: boolean
  max_downloads: number | null
  download_count: number
  expires_at: string | null
  status: 'draft' | 'active' | 'revoked' | 'expired'
  total_files: number
  total_size: number
  created_at: string
  finalized_at: string | null
}

export interface TransferFile {
  id: number
  relative_path: string
  size: number
  mime_type: string
  created_at: string
}

export interface TransferCollection {
  id: number
  public_key: string
  source_key: string
  source_name: string
  title: string
  description: string
  has_password: boolean
  max_file_size: number | null
  max_total_size: number | null
  require_name: boolean
  require_note: boolean
  allowed_exts: string[]
  expires_at: string | null
  status: 'active' | 'closed' | 'revoked' | 'expired'
  total_files: number
  total_size: number
  created_at: string
}

export interface TransferSubmission {
  id: number
  collection_id: number
  submitter_name: string
  note: string
  file_count: number
  total_size: number
  created_at: string
  files: Array<{
    id: number
    relative_path: string
    size: number
    mime_type: string
  }>
}

export interface TransferSettings {
  active_quota_bytes: number
  default_expiry_hours: number
}

// --- 所有者：发件包 ---

export async function createSend(input: {
  title: string
  description?: string
  expires_in_hours?: number
  max_downloads?: number
  password?: string
}): Promise<{ send: TransferSend; pickup_code: string }> {
  return apiFetch('/api/v1/transfers', { method: 'POST', body: JSON.stringify(input) })
}

export async function listMySends(): Promise<TransferSend[]> {
  const data = await apiFetch<{ items: TransferSend[]; total: number }>('/api/v1/transfers')
  return data.items ?? []
}

export async function uploadToSend(
  transferID: number,
  relativePath: string,
  file: File,
): Promise<TransferFile> {
  const form = new FormData()
  form.append('relative_path', relativePath)
  form.append('file', file)
  return apiFetch(`/api/v1/transfers/${transferID}/files/upload`, { method: 'POST', body: form })
}

export async function listSendFilesByID(transferID: number): Promise<TransferFile[]> {
  const data = await apiFetch<{ items: TransferFile[]; total: number }>(
    `/api/v1/transfers/${transferID}/files`,
  )
  return data.items ?? []
}

export async function copyIntoSend(
  transferID: number,
  sourceKey: string,
  paths: string[],
): Promise<TransferFile[]> {
  const data = await apiFetch<{ items: TransferFile[] }>(
    `/api/v1/transfers/${transferID}/files/from-store`,
    { method: 'POST', body: JSON.stringify({ source_key: sourceKey, paths }) },
  )
  return data.items ?? []
}

export async function finalizeSend(transferID: number): Promise<TransferSend> {
  return apiFetch(`/api/v1/transfers/${transferID}/finalize`, { method: 'POST' })
}

export async function revokeSend(transferID: number): Promise<void> {
  await apiFetch(`/api/v1/transfers/${transferID}`, { method: 'DELETE' })
}

// --- 所有者：收集任务 ---

export async function createCollection(input: {
  title: string
  description?: string
  expires_in_hours?: number
  password?: string
  max_file_size_mb?: number
  max_total_size_mb?: number
  require_name?: boolean
  require_note?: boolean
  allowed_exts?: string[]
}): Promise<{ collection: TransferCollection; code: string }> {
  return apiFetch('/api/v1/transfer-collections', { method: 'POST', body: JSON.stringify(input) })
}

export async function listMyCollections(): Promise<TransferCollection[]> {
  const data = await apiFetch<{ items: TransferCollection[]; total: number }>(
    '/api/v1/transfer-collections',
  )
  return data.items ?? []
}

export async function listSubmissions(collectionID: number): Promise<TransferSubmission[]> {
  const data = await apiFetch<{ items: TransferSubmission[]; total: number }>(
    `/api/v1/transfer-collections/${collectionID}/submissions`,
  )
  return data.items ?? []
}

export async function closeCollection(collectionID: number): Promise<void> {
  await apiFetch(`/api/v1/transfer-collections/${collectionID}/close`, { method: 'POST' })
}

export async function saveSubmissionToFiles(
  collectionID: number,
  submissionID: number,
  sourceKey: string,
  path: string,
): Promise<string[]> {
  const data = await apiFetch<{ saved: string[] }>(
    `/api/v1/transfer-collections/${collectionID}/submissions/${submissionID}/save-to-files`,
    { method: 'POST', body: JSON.stringify({ source_key: sourceKey, path }) },
  )
  return data.saved ?? []
}

export async function getTransferSettings(): Promise<TransferSettings> {
  return apiFetch('/api/v1/admin/transfer-settings')
}

export async function setTransferSettings(input: Partial<TransferSettings>): Promise<TransferSettings> {
  return apiFetch('/api/v1/admin/transfer-settings', { method: 'PUT', body: JSON.stringify(input) })
}

// --- 公开：取件（Send） ---

export interface TransferPublicInfo {
  public_key: string
  title: string
  description: string
  file_count: number
  total_size: number
  has_password: boolean
  downloads_left: number | null
  expires_at: string | null
}

export async function lookupTransfer(publicKey: string): Promise<TransferPublicInfo> {
  return apiFetch(`/api/v1/public/transfers/${encodeURIComponent(publicKey)}`)
}

export async function unlockTransfer(
  publicKey: string,
  pickupCode: string,
  password: string,
): Promise<{ token: string; expires_at: string }> {
  return apiFetch(`/api/v1/public/transfers/${encodeURIComponent(publicKey)}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ pickup_code: pickupCode, password }),
  })
}

export async function listTransferFiles(
  publicKey: string,
  token: string,
): Promise<TransferFile[]> {
  const data = await apiFetch<{ items: TransferFile[]; total: number }>(
    `/api/v1/public/transfers/${encodeURIComponent(publicKey)}/files`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return data.items ?? []
}

/** 公开流转内容的 Bearer 取流：下载与预览共用（Token 不进 URL）。 */
export async function fetchTransferBlob(
  path: string,
  token: string,
): Promise<{ blob: Blob; disposition: string | null; contentType: string }> {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    let error: { code: string; message: string } = { code: 'INTERNAL_ERROR', message: '请求失败' }
    try {
      const body = await response.json() as { error?: { code?: string; message?: string } }
      error = { code: body.error?.code ?? error.code, message: body.error?.message ?? error.message }
    } catch {
      // 非 JSON 错误响应使用通用提示。
    }
    throw new ApiRequestError(error, response.headers.get('X-Request-ID') ?? '')
  }
  return {
    blob: await response.blob(),
    disposition: response.headers.get('Content-Disposition'),
    contentType: response.headers.get('Content-Type') ?? 'application/octet-stream',
  }
}

/** 触发浏览器下载（对象 URL + 隐式锚点）。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const objectURL = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectURL
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectURL)
}

// --- 公开：收集（Collect） ---

export interface CollectionPublicInfo {
  public_key: string
  title: string
  description: string
  has_password: boolean
  max_file_size: number | null
  require_name: boolean
  require_note: boolean
  allowed_exts: string[]
  expires_at: string | null
}

export async function lookupCollection(publicKey: string): Promise<CollectionPublicInfo> {
  return apiFetch(`/api/v1/public/transfer-collections/${encodeURIComponent(publicKey)}`)
}

export async function unlockCollection(
  publicKey: string,
  code: string,
  password: string,
): Promise<{ token: string; expires_at: string }> {
  return apiFetch(`/api/v1/public/transfer-collections/${encodeURIComponent(publicKey)}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ code, password }),
  })
}

export async function submitToCollection(
  publicKey: string,
  token: string,
  input: { name: string; note: string; files: Array<{ relativePath: string; file: File }> },
): Promise<TransferSubmission> {
  const form = new FormData()
  form.append('name', input.name)
  form.append('note', input.note)
  for (const item of input.files) {
    form.append('relative_path', item.relativePath)
  }
  for (const item of input.files) {
    form.append('file', item.file)
  }
  return apiFetch(`/api/v1/public/transfer-collections/${encodeURIComponent(publicKey)}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
}

export type { FileListResult }
