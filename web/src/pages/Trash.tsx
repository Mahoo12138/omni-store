import { useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import {
  fetchMySources,
  fetchTrash,
  purgeTrash,
  restoreTrash,
  type TrashEntry,
} from '../api/sources'
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { DialogWrap } from '../components/ui/Dialog'
import { Field } from '../components/ui/Field'
import { Input } from '../components/ui/Input'
import { IconChevronLeft, IconFile, IconFolder, IconRefresh, IconRestore, IconTrash } from '../components/ui/Icon'
import { formatBytes, formatDate } from '../utils/format'
import * as css from './Trash.css'

export function TrashPage() {
  const { sourceKey } = useParams({ from: '/app/sources/$sourceKey/trash' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const source = sources.data?.find((item) => item.key === sourceKey)
  const trash = useQuery({
    queryKey: ['trash', sourceKey],
    queryFn: () => fetchTrash(sourceKey),
    enabled: Boolean(source),
  })
  const [restoreTarget, setRestoreTarget] = useState<TrashEntry | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<TrashEntry | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['trash', sourceKey] })
    queryClient.invalidateQueries({ queryKey: ['files', sourceKey] })
    queryClient.invalidateQueries({ queryKey: ['source-quota', sourceKey] })
    queryClient.invalidateQueries({ queryKey: ['my-quota'] })
  }

  if (sources.isPending) {
    return <AppShell title="回收站"><div className={css.centerState}>加载中…</div></AppShell>
  }
  if (!source) {
    return (
      <AppShell title="回收站">
        <div className={css.centerState}>
          <p>存储源不可用。</p>
          <Button variant="secondary" onClick={() => navigate({ to: '/app' })}>返回文件列表</Button>
        </div>
      </AppShell>
    )
  }

  const entries = trash.data ?? []
  return (
    <AppShell title={`${source.name}回收站`}>
      <header className={css.header}>
        <div>
          <button className={css.back} onClick={() => navigate({
            to: '/app/sources/$sourceKey', params: { sourceKey }, search: { path: '/', page: 1 },
          })}>
            <IconChevronLeft size={15} /> 返回 {source.name}
          </button>
          <h1 className={css.title}>回收站</h1>
          <p className={css.description}>删除的内容仍占用用户配额；永久清理后无法恢复。</p>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={trash.isFetching}>
          <IconRefresh size={14} /> {trash.isFetching ? '刷新中…' : '刷新'}
        </Button>
      </header>

      {notice ? (
        <div className={notice.kind === 'error' ? css.noticeError : css.noticeSuccess} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)}>关闭</button>
        </div>
      ) : null}

      <section className={css.panel}>
        {trash.isPending ? <div className={css.centerState}>正在读取回收站…</div> : null}
        {trash.isError ? (
          <div className={css.centerState}>
            <p>{trash.error instanceof ApiRequestError ? trash.error.message : '回收站加载失败。'}</p>
            <Button variant="secondary" onClick={refresh}>重试</Button>
          </div>
        ) : null}
        {trash.isSuccess && entries.length === 0 ? (
          <div className={css.empty}>
            <span className={css.emptyIcon}><IconTrash size={26} /></span>
            <h2>回收站为空</h2>
            <p>从文件管理器删除的内容会暂存在这里。</p>
          </div>
        ) : null}
        {trash.isSuccess && entries.length > 0 ? (
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th>名称</th>
                  <th className={css.pathCell}>原路径</th>
                  <th className={css.sizeCell}>大小</th>
                  <th className={css.timeCell}>删除时间</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.key}>
                    <td>
                      <span className={css.nameCell}>
                        {entry.type === 'dir' ? <IconFolder size={17} /> : <IconFile size={17} />}
                        <span>{entry.name}</span>
                      </span>
                    </td>
                    <td className={css.pathCell}>/{entry.original_path}</td>
                    <td className={css.sizeCell}>{formatBytes(entry.size)}{entry.type === 'dir' ? ` · ${entry.file_count} 个文件` : ''}</td>
                    <td className={css.timeCell}>{formatDate(entry.deleted_at)}</td>
                    <td>
                      <span className={css.actions}>
                        <button className={css.action} title="恢复" onClick={() => setRestoreTarget(entry)}>
                          <IconRestore size={15} />
                        </button>
                        <button className={css.dangerAction} title="永久删除" onClick={() => setPurgeTarget(entry)}>
                          <IconTrash size={15} />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {restoreTarget ? (
        <RestoreDialog
          sourceKey={sourceKey}
          entry={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onSuccess={() => {
            setRestoreTarget(null)
            setNotice({ kind: 'success', message: `已恢复 ${restoreTarget.name}。` })
            refresh()
          }}
        />
      ) : null}
      {purgeTarget ? (
        <PurgeDialog
          sourceKey={sourceKey}
          entry={purgeTarget}
          onClose={() => setPurgeTarget(null)}
          onSuccess={() => {
            setPurgeTarget(null)
            setNotice({ kind: 'success', message: `已永久删除 ${purgeTarget.name}。` })
            refresh()
          }}
        />
      ) : null}
    </AppShell>
  )
}

function RestoreDialog({ sourceKey, entry, onClose, onSuccess }: {
  sourceKey: string
  entry: TrashEntry
  onClose: () => void
  onSuccess: () => void
}) {
  const [targetPath, setTargetPath] = useState(`/${entry.original_path}`)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => restoreTrash(sourceKey, entry.key, targetPath.trim()),
    onSuccess,
    onError: (value) => setError(value instanceof ApiRequestError ? value.message : '恢复失败'),
  })
  function submit() {
    setError('')
    if (!targetPath.startsWith('/')) {
      setError('恢复路径必须以 / 开头')
      return
    }
    mutation.mutate()
  }
  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title="恢复文件"
      description="可恢复到原路径，也可指定同一存储源中的其他路径。"
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button onClick={submit} disabled={mutation.isPending}>{mutation.isPending ? '恢复中…' : '恢复'}</Button></>}
    >
      <Field label="恢复路径" required error={error} hint="目标父目录必须存在，且不会覆盖已有内容。">
        <Input autoFocus value={targetPath} onChange={(event) => setTargetPath(event.target.value)} />
      </Field>
    </DialogWrap>
  )
}

function PurgeDialog({ sourceKey, entry, onClose, onSuccess }: {
  sourceKey: string
  entry: TrashEntry
  onClose: () => void
  onSuccess: () => void
}) {
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => purgeTrash(sourceKey, entry.key),
    onSuccess,
    onError: (value) => setError(value instanceof ApiRequestError ? value.message : '永久删除失败'),
  })
  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title="永久删除"
      description={`“${entry.name}”删除后无法恢复，并会释放其占用的用户配额。`}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="danger" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? '删除中…' : '永久删除'}</Button></>}
    >
      {error ? <p className={css.dialogError} role="alert">{error}</p> : <p className={css.dialogText}>请确认这是你想永久清理的内容。</p>}
    </DialogWrap>
  )
}
