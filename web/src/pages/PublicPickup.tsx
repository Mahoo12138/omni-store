import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import {
  downloadBlob,
  fetchTransferBlob,
  listTransferFiles,
  lookupTransfer,
  unlockTransfer,
  type TransferFile,
} from '../api/transfers'
import { PublicShell } from '../components/layout/PublicShell'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { formatBytes } from '../utils/format'
import { IconCloud, IconDownload, IconKey } from '../components/ui/Icon'
import * as css from './PublicPickup.css'

// 公开取件页（2.0 Phase 5）：/t/{publicKey}，凭取件码（+可选密码）领取文件。

export function PublicPickupPage() {
  const { publicKey } = useParams({ from: '/pickup/$publicKey' })
  const [token, setToken] = useState<string | null>(null)

  const info = useQuery({
    queryKey: ['public-transfer', publicKey],
    queryFn: () => lookupTransfer(publicKey),
    retry: false,
  })

  if (info.isPending) {
    return <PublicShell><div className={css.state}>正在加载取件信息…</div></PublicShell>
  }
  if (info.isError || !info.data) {
    const code = info.error instanceof ApiRequestError ? info.error.code : ''
    if (code === 'TRANSFER_EXPIRED') {
      return <StatusView icon={<IconCloud size={34} />} title="发件包已过期" hint="该发件包已超过有效期，无法继续领取。请联系分享者重新分享。" />
    }
    return <StatusView icon={<IconCloud size={34} />} title="发件包不存在或已撤销" hint="链接可能输入有误，或交付已被撤销。请联系分享者确认。" />
  }
  if (!token) {
    return (
      <PublicShell>
        <UnlockCard
          publicKey={publicKey}
          title={info.data.title}
          hasPassword={info.data.has_password}
          onUnlocked={setToken}
        />
      </PublicShell>
    )
  }
  return <PickupContent publicKey={publicKey} token={token} title={info.data.title} description={info.data.description} />
}

function StatusView({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <PublicShell>
      <div className={css.state}>
        <span className={css.stateIcon}>{icon}</span>
        <h1>{title}</h1>
        <p>{hint}</p>
      </div>
    </PublicShell>
  )
}

function UnlockCard({ publicKey, title, hasPassword, onUnlocked }: {
  publicKey: string
  title: string
  hasPassword: boolean
  onUnlocked: (token: string) => void
}) {
  const [pickupCode, setPickupCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const unlock = useMutation({
    mutationFn: () => unlockTransfer(publicKey, pickupCode.trim(), password),
    onSuccess: (data) => onUnlocked(data.token),
    onError: (cause) => setError(cause instanceof ApiRequestError ? cause.message : '验证失败，请重试。'),
  })
  return (
    <div className={css.cardWrap}>
      <section className={css.card}>
        <span className={css.cardIcon}><IconKey size={28} /></span>
        <h1>取件</h1>
        <p>输入分享者提供的取件码{hasPassword ? '与访问密码' : ''}，领取「{title || '发件包'}」。</p>
        <form
          className={css.form}
          onSubmit={(event) => { event.preventDefault(); setError(''); unlock.mutate() }}
        >
          <Input
            autoFocus
            value={pickupCode}
            onChange={(event) => setPickupCode(event.target.value.toUpperCase())}
            placeholder="取件码"
            aria-label="取件码"
            maxLength={8}
          />
          {hasPassword ? (
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="访问密码"
              aria-label="访问密码"
            />
          ) : null}
          {error ? <span className={css.error} role="alert">{error}</span> : null}
          <Button type="submit" disabled={unlock.isPending || !pickupCode.trim()}>
            {unlock.isPending ? '验证中…' : '领取文件'}
          </Button>
        </form>
      </section>
    </div>
  )
}

function PickupContent({ publicKey, token, title, description }: {
  publicKey: string
  token: string
  title: string
  description: string
}) {
  const files = useQuery({
    queryKey: ['public-transfer-files', publicKey],
    queryFn: () => listTransferFiles(publicKey, token),
  })
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  async function download(entry: TransferFile | null) {
    setDownloading(true)
    setError('')
    try {
      if (entry) {
        const result = await fetchTransferBlob(
          `/api/v1/public/transfers/${encodeURIComponent(publicKey)}/files/${entry.id}/download`,
          token,
        )
        downloadBlob(result.blob, fileNameOf(entry.relative_path))
      } else {
        const result = await fetchTransferBlob(
          `/api/v1/public/transfers/${encodeURIComponent(publicKey)}/archive`,
          token,
        )
        downloadBlob(result.blob, `${title || '发件包'}.zip`)
      }
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : '下载失败，请重试。')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <PublicShell>
      <div className={css.content}>
        <header className={css.header}>
          <h1>{title || '发件包'}</h1>
          {description ? <p>{description}</p> : null}
        </header>
        <div className={css.toolbar}>
          <Button onClick={() => void download(null)} disabled={downloading}>
            <IconDownload size={15} /> 全部下载（ZIP）
          </Button>
        </div>
        {files.isPending ? <div className={css.state}>正在加载文件…</div> : null}
        {files.isError ? <div className={css.state}>无法获取文件列表。</div> : null}
        {files.data && files.data.length === 0 ? <div className={css.state}>发件包为空。</div> : null}
        {files.data && files.data.length > 0 ? (
          <ul className={css.fileList}>
            {files.data.map((entry) => (
              <li key={entry.id} className={css.fileRow}>
                <span className={css.filePath}>{entry.relative_path}</span>
                <span className={css.fileSize}>{formatBytes(entry.size)}</span>
                <Button
                  variant="secondary"
                  disabled={downloading}
                  onClick={() => void download(entry)}
                  aria-label={`下载 ${entry.relative_path}`}
                >
                  <IconDownload size={14} /> 下载
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <div role="alert" className={css.error}>{error}</div> : null}
      </div>
    </PublicShell>
  )
}

function fileNameOf(relativePath: string): string {
  const index = relativePath.lastIndexOf('/')
  return index >= 0 ? relativePath.slice(index + 1) : relativePath
}
