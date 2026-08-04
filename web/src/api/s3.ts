import { apiFetch } from './client'

export interface S3Credential {
  access_key_id: string
  name: string
  is_disabled: boolean
  created_at: string
  last_used_at: string | null
}

export async function fetchS3Credentials(): Promise<S3Credential[]> {
  const data = await apiFetch<{ items: S3Credential[]; total: number }>('/api/v1/me/s3-credentials')
  return data.items ?? []
}

export async function createS3Credential(name: string): Promise<{
  item: S3Credential
  secret_access_key: string
  notice: string
}> {
  return apiFetch('/api/v1/me/s3-credentials', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function setS3CredentialDisabled(accessKeyId: string, disabled: boolean): Promise<void> {
  await apiFetch(
    `/api/v1/me/s3-credentials/${encodeURIComponent(accessKeyId)}/${disabled ? 'disable' : 'enable'}`,
    { method: 'POST' },
  )
}

export async function deleteS3Credential(accessKeyId: string): Promise<void> {
  await apiFetch(`/api/v1/me/s3-credentials/${encodeURIComponent(accessKeyId)}`, { method: 'DELETE' })
}
