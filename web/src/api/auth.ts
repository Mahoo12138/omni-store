import { apiFetch, setCsrfToken } from './client'

export interface User {
  id: number
  user_public_id: string
  username: string
  display_name: string
  role: 'super_admin' | 'user'
  is_disabled: boolean
  created_at: string
  updated_at: string
}

interface AuthPayload {
  user: User
  csrf_token: string
}

export async function fetchMe(): Promise<User> {
  const data = await apiFetch<AuthPayload>('/api/v1/auth/me')
  setCsrfToken(data.csrf_token)
  return data.user
}

export async function fetchAuthStatus(): Promise<{ authenticated: boolean }> {
  return apiFetch('/api/v1/auth/status')
}

export async function login(username: string, password: string): Promise<User> {
  const data = await apiFetch<AuthPayload>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  setCsrfToken(data.csrf_token)
  return data.user
}

export async function logout(): Promise<void> {
  await apiFetch('/api/v1/auth/logout', { method: 'POST' })
  setCsrfToken('')
}

export async function fetchSetupStatus(): Promise<{ initialized: boolean }> {
  return apiFetch('/api/v1/setup/status')
}

export async function createFirstAdmin(input: {
  username: string
  display_name: string
  password: string
}): Promise<User> {
  return apiFetch('/api/v1/setup/admin', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
