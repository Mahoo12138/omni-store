// 预览内容读取：限制最大读取量，读满即取消连接，避免大文件整体进内存。
import { ApiRequestError } from '../api/client'

export interface CappedContent {
  buffer: Uint8Array
  truncated: boolean
}

// 读取不超过 maxBytes 的内容；超出即停止（AbortController 取消底层连接）。
export async function fetchCapped(url: string, maxBytes: number, signal?: AbortSignal): Promise<CappedContent> {
  const local = new AbortController()
  const onAbort = () => local.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const response = await fetch(url, { signal: local.signal, credentials: 'same-origin' })
    if (!response.ok) {
      throw new ApiRequestError(
        { code: 'PREVIEW_FETCH_FAILED', message: `预览内容获取失败（${response.status}）` },
        response.headers.get('x-request-id') ?? '',
      )
    }
    if (!response.body) {
      const buffer = new Uint8Array(await response.arrayBuffer())
      return { buffer, truncated: false }
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    let truncated = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.byteLength
      if (total >= maxBytes) {
        truncated = true
        void reader.cancel().catch(() => {})
        break
      }
    }
    const merged = new Uint8Array(Math.min(total, maxBytes))
    let offset = 0
    for (const chunk of chunks) {
      if (offset >= merged.length) break
      const size = Math.min(chunk.byteLength, merged.length - offset)
      merged.set(size === chunk.byteLength ? chunk : chunk.subarray(0, size), offset)
      offset += size
    }
    return { buffer: merged, truncated }
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function fetchCappedText(url: string, maxBytes: number, signal?: AbortSignal): Promise<{ text: string; truncated: boolean }> {
  const { buffer, truncated } = await fetchCapped(url, maxBytes, signal)
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return { text, truncated }
}

export async function fetchBlob(url: string, maxBytes: number, signal?: AbortSignal): Promise<{ blob: Blob; truncated: boolean }> {
  const { buffer, truncated } = await fetchCapped(url, maxBytes, signal)
  const copy = new Uint8Array(buffer)
  return { blob: new Blob([copy.buffer as ArrayBuffer], { type: 'application/octet-stream' }), truncated }
}
