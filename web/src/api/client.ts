// 后端统一响应格式的 API 客户端（README §19）。
// 网页登录态写操作自动携带 X-CSRF-Token（README §8.5）。

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export class ApiRequestError extends Error {
  code: string
  requestId: string
  details?: unknown

  constructor(error: ApiError, requestId: string) {
    super(error.message)
    this.code = error.code
    this.requestId = requestId
    this.details = error.details
  }
}

interface SuccessEnvelope<T> {
  data: T
  request_id: string
}

interface ErrorEnvelope {
  error: ApiError
  request_id: string
}

// CSRF Token 保存在内存中，登录或 /auth/me 时更新。
let csrfToken = ''

export function setCsrfToken(token: string) {
  csrfToken = token
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.headers as Record<string, string>),
  }
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  if (typeof init?.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(path, { ...init, method, headers })
  const body = (await res.json()) as SuccessEnvelope<T> | ErrorEnvelope
  if (!res.ok || 'error' in body) {
    const err = 'error' in body ? body : null
    throw new ApiRequestError(
      err?.error ?? { code: 'INTERNAL_ERROR', message: '请求失败' },
      err?.request_id ?? '',
    )
  }
  return body.data
}
