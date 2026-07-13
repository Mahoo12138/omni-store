import { apiFetch } from './client'
import type { User } from './auth'

// --- 管理员 API ---

export interface AdminSource {
  id: number
  source_id: string
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

export interface SourcePermission {
  user_id: number
  username: string
  source_id: string
  permission: 'read_only' | 'read_write'
  updated_at: string
}

export interface AuditLog {
  id: number
  actor_type: string
  actor_user_id: number | null
  entry_type: string
  action: string
  source_id: string | null
  relative_path: string | null
  target_relative_path: string | null
  ip_address: string | null
  status: string
  error_code: string | null
  created_at: string
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
  source_id: string
  name: string
  description: string
  root_path: string
}): Promise<AdminSource> {
  return apiFetch('/api/v1/admin/sources', { method: 'POST', body: JSON.stringify(input) })
}

export async function adminGetSource(sourceId: string): Promise<{
  source: AdminSource
  exclude_patterns: string[]
}> {
  return apiFetch(`/api/v1/admin/sources/${encodeURIComponent(sourceId)}`)
}

export async function adminUpdateSource(
  sourceId: string,
  input: Partial<{
    name: string
    description: string
    public_read_enabled: boolean
    public_mount_path: string
    webdav_enabled: boolean
    image_bed_enabled: boolean
  }>,
): Promise<AdminSource> {
  return apiFetch(`/api/v1/admin/sources/${encodeURIComponent(sourceId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function adminSetSourceDisabled(sourceId: string, disabled: boolean): Promise<void> {
  await apiFetch(
    `/api/v1/admin/sources/${encodeURIComponent(sourceId)}/${disabled ? 'disable' : 'enable'}`,
    { method: 'POST' },
  )
}

export async function adminDeleteSource(sourceId: string): Promise<void> {
  await apiFetch(`/api/v1/admin/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE' })
}

export async function adminSetExcludePatterns(sourceId: string, patterns: string[]): Promise<void> {
  await apiFetch(`/api/v1/admin/sources/${encodeURIComponent(sourceId)}/exclude-patterns`, {
    method: 'PUT',
    body: JSON.stringify({ patterns }),
  })
}

// 权限分配
export async function adminListPermissions(sourceId: string): Promise<SourcePermission[]> {
  const data = await apiFetch<{ items: SourcePermission[]; total: number }>(
    `/api/v1/admin/sources/${encodeURIComponent(sourceId)}/permissions`,
  )
  return data.items ?? []
}

export async function adminSetPermission(
  sourceId: string,
  userId: number,
  permission: 'read_only' | 'read_write',
): Promise<void> {
  await apiFetch(`/api/v1/admin/sources/${encodeURIComponent(sourceId)}/permissions/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ permission }),
  })
}

export async function adminRemovePermission(sourceId: string, userId: number): Promise<void> {
  await apiFetch(`/api/v1/admin/sources/${encodeURIComponent(sourceId)}/permissions/${userId}`, {
    method: 'DELETE',
  })
}

// 匿名图床配置
export async function adminGetAnonymousSettings(): Promise<{
  enabled: boolean
  source_id: string
}> {
  return apiFetch('/api/v1/admin/image-bed/anonymous-settings')
}

export async function adminSetAnonymousSettings(input: {
  enabled: boolean
  source_id: string
}): Promise<void> {
  await apiFetch('/api/v1/admin/image-bed/anonymous-settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

// 审计日志
export async function adminFetchAuditLogs(): Promise<AuditLog[]> {
  const data = await apiFetch<{ items: AuditLog[]; total: number }>('/api/v1/admin/audit-logs')
  return data.items ?? []
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
  source_id: string
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
  source_id?: string
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
