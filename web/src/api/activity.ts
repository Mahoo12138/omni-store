import { apiFetch } from './client'

// 当前用户最近活动（首页"最近活动"面板用，docs/home.png）。
// 后端可以从 audit_logs 拼装，这里只声明类型。
export interface ActivityItem {
  id: number
  // 'image_upload' | 'image_delete' | 'file_upload' | 'file_delete' | 'folder_create' | 'webdav_*' | ...
  action: string
  title: string
  source_name?: string
  relative_path?: string
  created_at: string
}

export async function fetchMyActivity(limit = 8): Promise<ActivityItem[]> {
  const data = await apiFetch<{ items: ActivityItem[]; total: number }>(
    `/api/v1/me/activity?limit=${limit}`,
  )
  return data.items ?? []
}
