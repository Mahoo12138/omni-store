import { apiFetch } from './client'

export interface FavoriteItem {
  id: number
  source_key: string
  source_name: string
  path: string
  name: string
  type: 'file' | 'dir'
  size: number
  modified_at: string
  created_at: string
}

export async function fetchMyFavorites(): Promise<FavoriteItem[]> {
  const data = await apiFetch<{ items: FavoriteItem[]; total: number }>('/api/v1/me/favorites')
  return data.items ?? []
}

export async function addFavorite(sourceKey: string, path: string): Promise<FavoriteItem> {
  return apiFetch('/api/v1/me/favorites', {
    method: 'POST',
    body: JSON.stringify({ source_key: sourceKey, path }),
  })
}

export async function removeFavorite(favoriteID: number): Promise<void> {
  await apiFetch(`/api/v1/me/favorites/${favoriteID}`, { method: 'DELETE' })
}
