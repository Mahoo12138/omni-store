import { apiFetch } from './client'
import type { ThemeMode } from '../utils/themeMode'

// 账号级界面偏好（docs/API.md §18）。theme 只有 light/dark/system 三档，
// 其它值服务端返回 VALIDATION_ERROR；类型收窄由 utils/themeMode 的 isThemeMode 负责。
export interface MyPreferences {
  theme: ThemeMode
  updated_at: string
}

export async function fetchPreferences(): Promise<MyPreferences> {
  return apiFetch<MyPreferences>('/api/v1/me/preferences')
}

export async function updatePreferences(theme: ThemeMode): Promise<MyPreferences> {
  return apiFetch<MyPreferences>('/api/v1/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ theme }),
  })
}
