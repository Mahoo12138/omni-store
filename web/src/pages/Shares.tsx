import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchShares, revokeShare, type FileShare } from '../api/shares'
import { AppShell } from '../components/layout/AppShell'
import { Badge } from '../components/ui/Badge'
import { DialogWrap } from '../components/ui/Dialog'
import { Button } from '../components/ui/Button'
import { IconCopy, IconExternalLink, IconFile, IconFolder, IconLink, IconTrash } from '../components/ui/Icon'
import { formatDate } from '../utils/format'
import * as css from './Shares.css'

export function SharesPage() {
  const queryClient = useQueryClient()
  const shares = useQuery({ queryKey: ['shares'], queryFn: fetchShares })
  const [copied, setCopied] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<FileShare | null>(null)

  const revoke = useMutation({
    mutationFn: (key: string) => revokeShare(key),
    onSuccess: async () => {
      setRevokeTarget(null)
      await queryClient.invalidateQueries({ queryKey: ['shares'] })
    },
  })

  async function copyLink(share: FileShare) {
    await navigator.clipboard.writeText(share.url)
    setCopied(share.key)
    window.setTimeout(() => setCopied(''), 1600)
  }

  return (
    <AppShell title="分享" wide>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>分享</h1>
          <p className={css.description}>集中查看、复制和撤销文件与目录分享。</p>
        </div>
      </header>

      {copied ? <div className={css.notice} role="status">分享链接已复制。</div> : null}
      {shares.isPending ? <div className={css.loading}>正在加载分享…</div> : null}
      {shares.isError ? (
        <div className={css.empty}>
          <span className={css.emptyIcon}><IconLink size={28} /></span>
          <h2>分享加载失败</h2>
          <p>请稍后刷新页面重试。</p>
        </div>
      ) : null}
      {shares.isSuccess && shares.data.length === 0 ? (
        <div className={css.empty}>
          <span className={css.emptyIcon}><IconLink size={28} /></span>
          <h2>还没有分享</h2>
          <p>在文件管理中选择文件或文件夹，点击链接图标即可创建分享。</p>
        </div>
      ) : null}
      {shares.isSuccess && shares.data.length > 0 ? (
        <div className={css.list}>
          {shares.data.map((share) => <ShareRow key={share.key} share={share} onCopy={() => void copyLink(share)} onRevoke={() => setRevokeTarget(share)} />)}
        </div>
      ) : null}

      {revokeTarget ? (
        <DialogWrap
          open
          onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}
          title="撤销分享"
          description={revokeTarget.name}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setRevokeTarget(null)}>取消</Button>
              <Button variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate(revokeTarget.key)}>
                {revoke.isPending ? '撤销中…' : '撤销分享'}
              </Button>
            </>
          )}
        >
          <p style={{ margin: 0 }}>撤销后，现有链接会立即失效，且无法恢复。</p>
        </DialogWrap>
      ) : null}
    </AppShell>
  )
}

function ShareRow({ share, onCopy, onRevoke }: { share: FileShare; onCopy: () => void; onRevoke: () => void }) {
  const left = share.max_downloads > 0 ? Math.max(0, share.max_downloads - share.download_count) : null
  return (
    <article className={css.card}>
      <span className={css.icon}>{share.type === 'dir' ? <IconFolder size={22} /> : <IconFile size={22} />}</span>
      <div className={css.identity}>
        <div className={css.nameRow}>
          <span className={css.name}>{share.name}</span>
          {share.protected ? <Badge color="purple">有密码</Badge> : <Badge color="gray">无密码</Badge>}
          {share.in_trash ? <Badge color="red">回收站中</Badge> : null}
        </div>
        <div className={css.path}>{share.source_name} · /{share.path}</div>
        <div className={css.meta}>
          <span>创建于 {formatDate(share.created_at)}</span>
          <span>创建者 {share.created_by_name}</span>
          <span>{share.expires_at ? `有效至 ${formatDate(share.expires_at)}` : '永久有效'}</span>
          <span>{left === null ? `已下载 ${share.download_count} 次` : `剩余 ${left} 次下载`}</span>
        </div>
      </div>
      <div className={css.actions}>
        <button className={css.linkButton} onClick={onCopy} aria-label={`复制 ${share.name} 的分享链接`} title="复制链接"><IconCopy size={16} /></button>
        <a className={css.linkButton} href={share.url} target="_blank" rel="noreferrer" aria-label={`打开 ${share.name} 的分享`} title="打开分享"><IconExternalLink size={16} /></a>
        <button className={css.dangerButton} onClick={onRevoke} aria-label={`撤销 ${share.name} 的分享`} title="撤销分享"><IconTrash size={16} /></button>
      </div>
    </article>
  )
}
