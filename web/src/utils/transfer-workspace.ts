export type TransferView = 'send' | 'collect' | 'history'
export type TransferRecordKind = 'send' | 'collect'
export interface TransferWorkspaceSearch {
  view: TransferView
  record?: TransferRecordKind
  id?: number
}

export function validateTransferSearch(search: Record<string, unknown>): TransferWorkspaceSearch {
  const view = search.view === 'collect' || search.view === 'history' ? search.view : 'send'
  const id = Number(search.id)
  const record = search.record === 'send' || search.record === 'collect' ? search.record : undefined
  return view === 'history' && record && Number.isSafeInteger(id) && id > 0
    ? { view, record, id }
    : { view }
}

export function validateTransferRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return undefined
  let url: URL
  try { url = new URL(value, 'https://local.invalid') } catch { return undefined }
  if (url.origin !== 'https://local.invalid' || !['/transfer', '/app/transfer'].includes(url.pathname) || url.hash) return undefined
  if ([...url.searchParams.keys()].some((key) => !['view', 'record', 'id'].includes(key))) return undefined
  const raw = Object.fromEntries(url.searchParams)
  const search = validateTransferSearch(raw)
  if (raw.view && raw.view !== search.view) return undefined
  if ((raw.record || raw.id) && (!search.record || !search.id)) return undefined
  const params = new URLSearchParams({ view: search.view })
  if (search.record && search.id) { params.set('record', search.record); params.set('id', String(search.id)) }
  return `${url.pathname}?${params}`
}

export function transferFilePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
}
