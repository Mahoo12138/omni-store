import { apiFetch, ApiRequestError } from './client'
import type { User } from './auth'

// --- 管理员 API ---

export interface AdminSource {
  id: number
  key: string
  name: string
  description: string
  root_path: string
  is_disabled: boolean
  public_read_enabled: boolean
  public_mount_path: string | null
  webdav_enabled: boolean
  image_bed_enabled: boolean
  created_at: string
  updated_at: string
}

export type AccessPermission = 'read_only' | 'read_write'

export interface AccessPolicy {
  key: string
  name: string
  description: string
  sources: Array<{
    source_key: string
    source_name: string
    permission: AccessPermission
  }>
  users: Array<{
    user_id: number
    username: string
    display_name: string
  }>
  created_at: string
  updated_at: string
}

export interface AccessPolicyInput {
  name: string
  description: string
  sources: Array<{
    source_key: string
    permission: AccessPermission
  }>
  user_ids: number[]
}

export interface SourcePreflight {
  root_path: string
  is_empty: boolean
  summary: {
    total_entries: number
    visible_entries: number
    files: number
    directories: number
    symlinks: number
    unsupported_entries: number
    excluded_entries: number
  }
  entries: Array<{
    name: string
    kind: 'file' | 'directory' | 'symlink' | 'unsupported'
  }>
  sample_truncated: boolean
  exclude_patterns: string[]
  warnings: string[]
}

export interface AuditLog {
  id: number
  actor_type: string
  actor_user_id: number | null
  entry_type: string
  action: string
  storage_source_id: number | null
  storage_source_name: string | null
  relative_path: string | null
  target_relative_path: string | null
  ip_address: string | null
  status: string
  error_code: string | null
  created_at: string
}

export interface AuditLogQuery {
  page: number
  page_size: number
  actor_type?: 'user' | 'anonymous' | 'system'
  entry_type?: 'web' | 'webdav' | 's3' | 'image_bed' | 'anonymous_image_bed' | 'admin' | 'cli'
  status?: 'success' | 'failed'
  q?: string
}

export interface AuditLogPage {
  items: AuditLog[]
  total: number
}

// 用户管理
export async function adminListUsers(): Promise<User[]> {
  const data = await apiFetch<{ items: User[]; total: number }>('/api/v1/admin/users')
  return data.items ?? []
}

export async function adminCreateUser(input: {
  username: string
  display_name: string
  password: string
  role: string
}): Promise<User> {
  return apiFetch('/api/v1/admin/users', { method: 'POST', body: JSON.stringify(input) })
}

export async function adminSetUserDisabled(id: number, disabled: boolean): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${id}/${disabled ? 'disable' : 'enable'}`, { method: 'POST' })
}

export async function adminDeleteUser(id: number): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${id}`, { method: 'DELETE' })
}

// 存储源管理
export async function adminListSources(): Promise<AdminSource[]> {
  const data = await apiFetch<{ items: AdminSource[]; total: number }>('/api/v1/admin/sources')
  return data.items ?? []
}

export async function adminCreateSource(input: {
  name: string
  description: string
  root_path: string
  exclude_patterns?: string[]
}): Promise<AdminSource> {
  return apiFetch('/api/v1/admin/sources', { method: 'POST', body: JSON.stringify(input) })
}

export async function adminPreflightSource(input: {
  root_path: string
  exclude_patterns?: string[]
}): Promise<SourcePreflight> {
  return apiFetch('/api/v1/admin/sources/preflight', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function adminGetSource(sourceKey: string): Promise<{
  source: AdminSource
  exclude_patterns: string[]
}> {
  return apiFetch(`/api/v1/admin/sources/${encodeURIComponent(sourceKey)}`)
}

export async function adminUpdateSource(
  sourceKey: string,
  input: Partial<{
    name: string
    description: string
    public_read_enabled: boolean
    public_mount_path: string
    webdav_enabled: boolean
    image_bed_enabled: boolean
  }>,
): Promise<AdminSource> {
  return apiFetch(`/api/v1/admin/sources/${encodeURIComponent(sourceKey)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function adminSetSourceDisabled(sourceKey: string, disabled: boolean): Promise<void> {
  await apiFetch(
    `/api/v1/admin/sources/${encodeURIComponent(sourceKey)}/${disabled ? 'disable' : 'enable'}`,
    { method: 'POST' },
  )
}

export async function adminDeleteSource(sourceKey: string): Promise<void> {
  await apiFetch(`/api/v1/admin/sources/${encodeURIComponent(sourceKey)}`, { method: 'DELETE' })
}

export async function adminSetExcludePatterns(sourceKey: string, patterns: string[]): Promise<void> {
  await apiFetch(`/api/v1/admin/sources/${encodeURIComponent(sourceKey)}/exclude-patterns`, {
    method: 'PUT',
    body: JSON.stringify({ patterns }),
  })
}

// 访问策略
export async function adminListPolicies(): Promise<AccessPolicy[]> {
  const data = await apiFetch<{ items: AccessPolicy[]; total: number }>('/api/v1/admin/policies')
  return data.items ?? []
}

export async function adminCreatePolicy(input: AccessPolicyInput): Promise<AccessPolicy> {
  return apiFetch('/api/v1/admin/policies', { method: 'POST', body: JSON.stringify(input) })
}

export async function adminUpdatePolicy(policyKey: string, input: AccessPolicyInput): Promise<AccessPolicy> {
  return apiFetch(`/api/v1/admin/policies/${encodeURIComponent(policyKey)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function adminDeletePolicy(policyKey: string): Promise<void> {
  await apiFetch(`/api/v1/admin/policies/${encodeURIComponent(policyKey)}`, { method: 'DELETE' })
}

// 匿名图床配置
export async function adminGetAnonymousSettings(): Promise<{
  enabled: boolean
  key: string
}> {
  return apiFetch('/api/v1/admin/image-bed/anonymous-settings')
}

export async function adminSetAnonymousSettings(input: {
  enabled: boolean
  key: string
}): Promise<void> {
  await apiFetch('/api/v1/admin/image-bed/anonymous-settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

// 审计日志
export async function adminFetchAuditLogs(query: AuditLogQuery): Promise<AuditLogPage> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.page_size),
  })
  if (query.actor_type) params.set('actor_type', query.actor_type)
  if (query.entry_type) params.set('entry_type', query.entry_type)
  if (query.status) params.set('status', query.status)
  if (query.q) params.set('q', query.q)

  const data = await apiFetch<AuditLogPage>(`/api/v1/admin/audit-logs?${params}`)
  return { items: data.items ?? [], total: data.total ?? 0 }
}

// 系统配置包导出（ZIP 二进制响应，不走 JSON envelope）。
export async function adminExportSystemConfig(): Promise<string> {
  const response = await fetch('/api/v1/admin/system/config-export', {
    headers: { Accept: 'application/zip' },
  })
  if (!response.ok) {
    let message = '导出系统配置包失败'
    let code = 'INTERNAL_ERROR'
    let requestId = ''
    try {
      const body = await response.json() as {
        error?: { code?: string; message?: string }
        request_id?: string
      }
      message = body.error?.message ?? message
      code = body.error?.code ?? code
      requestId = body.request_id ?? ''
    } catch {
      // 非 JSON 错误响应使用通用提示。
    }
    throw new ApiRequestError({ code, message }, requestId)
  }

  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename="?([^";]+)"?/i)
  const filename = match?.[1] ?? 'omnistore-system-config.zip'
  const objectURL = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = objectURL
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectURL)
  return filename
}

// 概览 dashboard
export interface OverviewSystem {
  version: string
  data_dir: string
  http_addr: string
  public_url: string
  s3_enabled: boolean
  s3_status: string
  webdav_status: string
}
export interface OverviewSource {
  key: string
  name: string
  root_path: string
  public_mount_path?: string
  webdav_enabled: boolean
  image_bed_enabled: boolean
  public_read_enabled: boolean
  is_disabled: boolean
}
export interface OverviewUser {
  id: number
  username: string
  display_name: string
  role: string
  is_disabled: boolean
  permission_count: number // -1 表示全部
  permission_all: boolean
}
export interface OverviewAudit {
  id: number
  action: string
  status: string
  actor_name: string
  actor_type: string
  source_name?: string
  created_at: string
  title: string
}
export interface AdminOverview {
  source_count: number
  user_count: number
  public_mount_count: number
  anonymous_image_bed_on: boolean
  sources: OverviewSource[]
  users: OverviewUser[]
  recent_audits: OverviewAudit[]
  system: OverviewSystem
}
export async function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>('/api/v1/admin/overview')
}

// 用户自助
export async function updateProfile(displayName: string): Promise<User> {
  return apiFetch('/api/v1/me/profile', {
    method: 'PATCH',
    body: JSON.stringify({ display_name: displayName }),
  })
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/api/v1/me/password', {
    method: 'POST',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  })
}
