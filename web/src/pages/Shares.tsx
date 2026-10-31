import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchShares, revokeShare, type FileShare } from '../api/shares'
import { AppFrame } from '../components/shell/AppFrame'
import { PageHeader } from '../components/shell/PageHeader'
import { StateView } from '../components/shell/StateView'
import { QrCodeDialog } from '../components/share/QrCodeDialog'
import { Badge } from '../components/ui/Badge'
import { DialogWrap } from '../components/ui/Dialog'
import { Button } from '../components/ui/Button'
import { ExternalLinkButton } from '../components/ui/LinkButton'
import { IconCopy, IconExternalLink, IconFile, IconFolder, IconLink, IconQr, IconTrash } from '../components/ui/Icon'
import { toastSuccess } from '../components/ui/Toast'
import { formatDate } from '../utils/format'
import { useStyles } from './Shares.styles'

export function SharesPage() {
  const css = useStyles()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const shares = useQuery({ queryKey: ['shares'], queryFn: fetchShares })
  const [revokeTarget, setRevokeTarget] = useState<FileShare | null>(null)
  const [qrTarget, setQrTarget] = useState<FileShare | null>(null)

  const revoke = useMutation({
    mutationFn: (key: string) => revokeShare(key),
    onSuccess: async () => {
      setRevokeTarget(null)
      await queryClient.invalidateQueries({ queryKey: ['shares'] })
    },
  })

  async function copyLink(share: FileShare) {
    await navigator.clipboard.writeText(share.url)
    toastSuccess('分享链接已复制。')
  }

  return (
    <AppFrame title="分享">
      <PageHeader
        eyebrow="个人空间"
        title="分享"
      />

      {shares.isPending ? (
        <StateView kind="pending" title="正在加载分享…" />
      ) : null}
      {shares.isError ? (
        <StateView
          kind="error"
          icon={<IconLink size={22} />}
          title="分享加载失败"
          description="请稍后刷新页面重试。"
          action={<Button variant="secondary" onClick={() => shares.refetch()}>重新加载</Button>}
        />
      ) : null}
      {shares.isSuccess && shares.data.length === 0 ? (
        <StateView
          kind="empty"
          icon={<IconLink size={22} />}
          title="还没有分享"
          action={<Button variant="secondary" onClick={() => navigate({ to: '/app' })}>前往文件</Button>}
        />
      ) : null}
      {shares.isSuccess && shares.data.length > 0 ? (
        <div className={css.list}>
          {shares.data.map((share) => <ShareRow key={share.key} share={share} onCopy={() => void copyLink(share)} onQr={() => setQrTarget(share)} onRevoke={() => setRevokeTarget(share)} />)}
        </div>
      ) : null}

      {qrTarget ? (
        <QrCodeDialog url={qrTarget.url} name={qrTarget.name} onClose={() => setQrTarget(null)} />
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
    </AppFrame>
  )
}

function ShareRow({ share, onCopy, onQr, onRevoke }: { share: FileShare; onCopy: () => void; onQr: () => void; onRevoke: () => void }) {
  const css = useStyles()
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
        <Button variant="ghost" onClick={onCopy} aria-label={`复制 ${share.name} 的分享链接`} title="复制链接" icon={<IconCopy size={16} />} />
        <Button variant="ghost" onClick={onQr} aria-label={`查看 ${share.name} 的二维码`} title="二维码" icon={<IconQr size={16} />} />
        <ExternalLinkButton variant="ghost" href={share.url} target="_blank" rel="noreferrer" aria-label={`打开 ${share.name} 的分享`} title="打开分享" icon={<IconExternalLink size={16} />} />
        <Button variant="dangerGhost" onClick={onRevoke} aria-label={`撤销 ${share.name} 的分享`} title="撤销分享" icon={<IconTrash size={16} />} />
      </div>
    </article>
  )
}
