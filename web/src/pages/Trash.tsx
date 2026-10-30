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
import { AppFrame } from '../components/shell/AppFrame'
import { Banner } from '../components/shell/Banner'
import { FormField } from '../components/shell/FormLayout'
import { StateView } from '../components/shell/StateView'
import { Button } from '../components/ui/Button'
import { DialogWrap } from '../components/ui/Dialog'
import { IconAction } from '../components/ui/IconAction'
import { Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { IconChevronLeft, IconFile, IconFolder, IconRefresh, IconRestore, IconTrash } from '../components/ui/Icon'
import { toastSuccess } from '../components/ui/Toast'
import { formatBytes, formatDate } from '../utils/format'
import { useStyles } from './Trash.styles'

export function TrashPage() {
  const css = useStyles()
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

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['trash', sourceKey] })
    queryClient.invalidateQueries({ queryKey: ['files', sourceKey] })
    queryClient.invalidateQueries({ queryKey: ['source-quota', sourceKey] })
    queryClient.invalidateQueries({ queryKey: ['my-quota'] })
  }

  if (sources.isPending) {
    return <AppFrame title="回收站"><div className={css.centerState}>加载中…</div></AppFrame>
  }
  if (!source) {
    return (
      <AppFrame title="回收站">
        <StateView
          kind="unavailable"
          titleAs={1}
          icon={<IconTrash size={22} />}
          title="存储源不可用"
          description="该存储源不可访问，或你没有查看回收站的权限。"
          action={
            <>
              <Button onClick={() => sources.refetch()}>重新加载</Button>
              <Button variant="secondary" onClick={() => navigate({ to: '/app' })}>返回文件列表</Button>
            </>
          }
        />
      </AppFrame>
    )
  }

  const entries = trash.data ?? []
  return (
    <AppFrame title={`${source.name}回收站`}>
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
        <Button variant="secondary" onClick={refresh} disabled={trash.isFetching} icon={<IconRefresh size={14} />}>{trash.isFetching ? '刷新中…' : '刷新'}</Button>
      </header>

      {trash.isPending ? <StateView kind="pending" title="正在读取回收站…" /> : null}
      {trash.isError ? (
        <StateView
          kind="error"
          icon={<IconTrash size={22} />}
          title="回收站加载失败"
          description={trash.error instanceof ApiRequestError ? trash.error.message : '无法连接到实例服务，请稍后重试。'}
          action={<Button onClick={refresh}>重试</Button>}
        />
      ) : null}
      {trash.isSuccess && entries.length === 0 ? (
        <StateView
          kind="empty"
          icon={<IconTrash size={22} />}
          title="回收站为空"
          description="从文件管理器删除的内容会暂存在这里。"
        />
      ) : null}
      {trash.isSuccess && entries.length > 0 ? (
        <section className={css.panel}>
          <div className={css.tableWrap}>
            <Table className={css.table} size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>名称</TableHeaderCell>
                  <TableHeaderCell className={css.pathCell}>原路径</TableHeaderCell>
                  <TableHeaderCell className={css.sizeCell}>大小</TableHeaderCell>
                  <TableHeaderCell className={css.timeCell}>删除时间</TableHeaderCell>
                  <TableHeaderCell aria-label="操作" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.key}>
                    <TableCell>
                      <span className={css.nameCell}>
                        {entry.type === 'dir' ? <IconFolder size={17} /> : <IconFile size={17} />}
                        <span>{entry.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className={css.pathCell}>/{entry.original_path}</TableCell>
                    <TableCell className={css.sizeCell}>{formatBytes(entry.size)}{entry.type === 'dir' ? ` · ${entry.file_count} 个文件` : ''}</TableCell>
                    <TableCell className={css.timeCell}>{formatDate(entry.deleted_at)}</TableCell>
                    <TableCell>
                      <span className={css.actions}>
                        <IconAction label="恢复" icon={<IconRestore size={16} />} onClick={() => setRestoreTarget(entry)} />
                        <IconAction label="永久删除" icon={<IconTrash size={16} />} danger onClick={() => setPurgeTarget(entry)} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {restoreTarget ? (
        <RestoreDialog
          sourceKey={sourceKey}
          entry={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onSuccess={() => {
            setRestoreTarget(null)
            toastSuccess(`已恢复 ${restoreTarget.name}。`)
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
            toastSuccess(`已永久删除 ${purgeTarget.name}。`)
            refresh()
          }}
        />
      ) : null}
    </AppFrame>
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
      <FormField label="恢复路径" required error={error} hint="目标父目录必须存在，且不会覆盖已有内容。">
        <Input autoFocus value={targetPath} onChange={(event) => setTargetPath(event.target.value)} />
      </FormField>
    </DialogWrap>
  )
}

function PurgeDialog({ sourceKey, entry, onClose, onSuccess }: {
  sourceKey: string
  entry: TrashEntry
  onClose: () => void
  onSuccess: () => void
}) {
  const css = useStyles()
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
      {error ? <Banner intent="error">{error}</Banner> : <p className={css.dialogText}>请确认这是你想永久清理的内容。</p>}
    </DialogWrap>
  )
}
