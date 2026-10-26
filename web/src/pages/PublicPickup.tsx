import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import { downloadBlob, fetchTransferBlob, listTransferFiles, lookupTransfer, unlockTransfer, type TransferFile } from '../api/transfers'
import { PublicTransferShell } from '../components/transfer/PublicTransferShell'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/shell/FormLayout'
import { Input } from '@fluentui/react-components'
import { IconDownload, IconFile, IconKey } from '../components/ui/Icon'
import { formatBytes } from '../utils/format'
import { useStyles } from './PublicCollect.styles'

type Access = { token: string; expires_at: string }

export function PublicPickupPage() {
  const { publicKey } = useParams({ from: '/pickup/$publicKey' })
  return <PickupTask key={publicKey} publicKey={publicKey} />
}

function PickupTask({ publicKey }: { publicKey: string }) {
  const css = useStyles()
  const queryClient = useQueryClient()
  const autoStarted = useRef(false)
  const recoveringToken = useRef('')
  const recoveryActive = useRef(false)
  const [access, setAccess] = useState<Access | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [sessionMessage, setSessionMessage] = useState('')
  const [unavailable, setUnavailable] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const info = useQuery({ queryKey: ['public-transfer', publicKey], queryFn: () => lookupTransfer(publicKey), retry: false })
  const requiresCode = info.data?.require_code !== false
  const protectedTask = requiresCode || info.data?.has_password === true

  const unlock = useMutation({
    mutationFn: (credentials: { code: string; password: string }) => unlockTransfer(publicKey, credentials.code, credentials.password),
    onSuccess: (data) => { setAccess(data); setAuthError(''); setSessionMessage((current) => current ? '验证已恢复，请重新选择要下载的文件。' : '') },
    onError: (cause) => { if (isUnavailable(cause)) setUnavailable(cause.message); else setAuthError(errorMessage(cause, '验证失败，请重试。')) },
  })
  const { mutate: unlockAccess } = unlock
  useEffect(() => {
    if (!info.data || info.isFetching || protectedTask || access || unavailable || autoStarted.current) return
    autoStarted.current = true
    unlockAccess({ code: '', password: '' })
  }, [info.data, info.isFetching, protectedTask, access, unavailable, unlockAccess])

  const files = useQuery({
    queryKey: ['public-transfer-files', publicKey, access?.token],
    queryFn: () => {
      if (!access) throw new Error('请先完成访问验证')
      return listTransferFiles(publicKey, access.token)
    },
    enabled: !!access && !unavailable,
    retry: false,
    // File lists belong to one authorized session and are discarded when it ends.
    gcTime: 0,
  })

  const resetAccess = useCallback(() => {
    setAccess(null)
    setAuthError('')
    setError('')
    setSessionMessage('访问会话已失效，请重新验证后领取文件。')
    autoStarted.current = false
  }, [])

  const recoverAccess = useCallback(async (cause: unknown) => {
    if (cause instanceof ApiRequestError && cause.code === 'TRANSFER_EXPIRED') {
      setUnavailable(cause.message)
      return
    }
    if (cause instanceof ApiRequestError && (cause.code === 'UNAUTHORIZED' || cause.code === 'FILE_NOT_FOUND')) {
      if (recoveryActive.current) return
      recoveryActive.current = true
      try {
        const latest = await lookupTransfer(publicKey)
        queryClient.setQueryData(['public-transfer', publicKey], latest)
        resetAccess()
      } catch (lookupError) {
        if (isUnavailable(lookupError)) setUnavailable(lookupError.message)
        else {
          recoveringToken.current = ''
          setError(errorMessage(lookupError, '无法确认发件包状态，请重试。'))
        }
      } finally {
        recoveryActive.current = false
      }
      return
    }
    recoveringToken.current = ''
    setError(errorMessage(cause, '请求失败，请重试。'))
  }, [publicKey, queryClient, resetAccess])

  // The API uses the same 404 for an expired session and a removed package.
  // Check public metadata once before offering another authentication attempt.
  useEffect(() => {
    if (!files.isError || !access || recoveringToken.current === access.token) return
    recoveringToken.current = access.token
    void recoverAccess(files.error)
  }, [files.isError, files.error, access, recoverAccess])

  async function download(entry: TransferFile | null) {
    if (!access || downloading) return
    if (Date.parse(access.expires_at) <= Date.now()) { resetAccess(); return }
    setDownloading(true)
    setError('')
    try {
      const path = entry
        ? `/api/v1/public/transfers/${encodeURIComponent(publicKey)}/files/${entry.id}/download`
        : `/api/v1/public/transfers/${encodeURIComponent(publicKey)}/archive`
      const result = await fetchTransferBlob(path, access.token)
      downloadBlob(result.blob, entry ? fileNameOf(entry.relative_path) : `${info.data?.title || '发件包'}.zip`)
      void info.refetch()
    } catch (cause) {
      await recoverAccess(cause)
    } finally {
      setDownloading(false)
    }
  }

  if (info.isPending) return <PublicTransferShell title="领取文件"><div className={css.workbench}><div className={css.state} role="status">正在加载取件信息…</div></div></PublicTransferShell>
  if (info.isError || !info.data || unavailable) {
    const terminal = unavailable !== '' || isUnavailable(info.error)
    const message = unavailable || (info.error instanceof ApiRequestError && info.error.code === 'FILE_NOT_FOUND'
      ? '发件包不存在或已撤销'
      : info.error instanceof ApiRequestError && info.error.code === 'TRANSFER_EXPIRED'
        ? '发件包已过期'
        : errorMessage(info.error, '发件包加载失败'))
    return <PublicTransferShell title="领取文件"><div className={css.workbench}><div className={css.state} role="alert">
      <h2>{message}</h2><p>{terminal ? '该发件包目前无法领取，请联系分享者确认。' : '暂时无法获取取件信息，请重试。'}</p>
      {!terminal ? <Button variant="secondary" onClick={() => void info.refetch()}>重新加载</Button> : null}
    </div></div></PublicTransferShell>
  }
  const title = info.data.title || '领取文件'
  const summary = <div className={css.summary}><span>{info.data.file_count} 个文件 · {formatBytes(info.data.total_size)}</span>{info.data.expires_at ? <span>截止 {new Date(info.data.expires_at).toLocaleString()}</span> : null}{info.data.downloads_left != null ? <span>剩余 {info.data.downloads_left} 次下载</span> : null}</div>

  return <PublicTransferShell title={title} description={info.data.description || '领取分享者发送的文件。'} summary={summary}>
    <div className={css.workbench}>
      {!access ? protectedTask ? <section className={css.auth}>
        <div className={css.authHeader}><span className={css.authIcon}><IconKey size={28} /></span><h2>验证后领取文件</h2><p className={css.hint}>请填写分享者提供的{requiresCode ? '取件码' : ''}{requiresCode && info.data.has_password ? '和' : ''}{info.data.has_password ? '访问密码' : ''}。</p></div>
        {sessionMessage ? <p className={css.hint} role="status">{sessionMessage}</p> : null}
        <form className={css.form} onSubmit={(event) => {
          event.preventDefault(); setAuthError('');
          unlock.mutate({ code: requiresCode ? code.trim() : '', password: info.data.has_password ? password : '' })
        }}>
          {requiresCode ? <FormField label="取件码"><Input autoFocus value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={8} autoComplete="off" required disabled={unlock.isPending} /></FormField> : null}
          {info.data.has_password ? <FormField label="访问密码"><Input type="password" autoFocus={!requiresCode} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={unlock.isPending} /></FormField> : null}
          {authError ? <p className={css.error} role="alert">{authError}</p> : null}
          <Button type="submit" disabled={unlock.isPending || (requiresCode && !code.trim()) || (info.data.has_password && !password)}>{unlock.isPending ? '验证中…' : '领取文件'}</Button>
        </form>
      </section> : <div className={css.state}>
        {authError ? <><h2>暂时无法领取文件</h2><p role="alert">{authError}</p><Button variant="secondary" onClick={() => { setAuthError(''); unlock.mutate({ code: '', password: '' }) }}>重试</Button></> : <p role="status">正在准备取件…</p>}
      </div> : <>
        <div className={css.toolbar}><h2>文件列表</h2><Button onClick={() => void download(null)} disabled={downloading || !files.data?.length}><IconDownload size={16} /> {downloading ? '正在准备下载…' : '全部下载（ZIP）'}</Button></div>
        {files.isPending ? <div className={css.state} role="status">正在加载文件…</div> : null}
        {files.isError ? <div className={css.state}><p role="alert">{errorMessage(files.error, '无法获取文件列表。')}</p><Button variant="secondary" onClick={() => void files.refetch()}>重新加载文件</Button></div> : null}
        {files.data && files.data.length === 0 ? <div className={css.state}>发件包中没有文件。</div> : null}
        {files.data && files.data.length > 0 ? <ul className={css.fileList}>{files.data.map((entry) => <li key={entry.id} className={css.downloadRow}>
          <div className={css.downloadDetails}><span className={css.fileIcon}><IconFile size={19} /></span><div className={css.fileDetails}><span className={css.filePath}>{entry.relative_path}</span><span className={css.fileSize}>{formatBytes(entry.size)}</span></div></div>
          <Button variant="secondary" disabled={downloading} onClick={() => void download(entry)} aria-label={`下载 ${entry.relative_path}`}><IconDownload size={15} /> 下载</Button>
        </li>)}</ul> : null}
        {sessionMessage ? <p className={css.hint} role="status">{sessionMessage}</p> : null}
        {error ? <p role="alert" className={css.error}>{error}</p> : null}
      </>}
    </div>
  </PublicTransferShell>
}

function fileNameOf(relativePath: string): string { return relativePath.slice(relativePath.lastIndexOf('/') + 1) }
function isUnavailable(cause: unknown): cause is ApiRequestError { return cause instanceof ApiRequestError && (cause.code === 'TRANSFER_EXPIRED' || cause.code === 'FILE_NOT_FOUND') }
function errorMessage(cause: unknown, fallback: string): string { return cause instanceof ApiRequestError ? cause.message : fallback }
