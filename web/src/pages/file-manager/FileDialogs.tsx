import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Input } from '@fluentui/react-components'
import { createFolder, deleteFile, renameFile, type FileEntry } from '../../api/sources'
import { ApiRequestError } from '../../api/client'
import { createShare, type FileShare } from '../../api/shares'
import { Button } from '../../components/ui/Button'
import { DialogWrap } from '../../components/ui/Dialog'
import { Banner } from '../../components/shell/Banner'
import { FormField, FormLayout } from '../../components/shell/FormLayout'
import { Select } from '../../components/ui/Select'
import { IconCopy } from '../../components/ui/Icon'
import { joinPath } from '../../utils/filePaths'
import type { UploadConflictDecision, UploadTaskItem } from '../../utils/uploadTask'
import { useStyles } from './FileDialogs.styles'

// 文件管理器的 8 个弹窗：新建/重命名/删除确认、单项与批量分享、
// 上传目录提示、重名冲突、批量删除确认。字段一律走 shell/FormLayout + 原生 Field。
export function DirectoryUploadDialog({
  open,
  onOpenChange,
  supportsDirectoryPicker,
  onChoose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  supportsDirectoryPicker: boolean
  onChoose: () => void
}) {
  const css = useStyles()
  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title="上传目录"
      description="选择一个目录，目录中的文件会按原有层级上传到当前位置。"
      footer={(
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={onChoose}>选择目录</Button>
        </>
      )}
    >
      <p className={css.dialogHint}>
        {supportsDirectoryPicker
          ? '选择后会读取目录中的文件，并保留子目录结构。'
          : '当前浏览器不支持目录读取 API，将使用兼容模式选择目录。'}
      </p>
    </DialogWrap>
  )
}

export function UploadConflictDialog({
  item,
  onDecision,
}: {
  item: UploadTaskItem
  onDecision: (decision: UploadConflictDecision) => void
}) {
  const css = useStyles()
  return (
    <DialogWrap
      open
      onOpenChange={(open) => {
        if (!open) onDecision('cancel')
      }}
      title="发现重名文件"
      description="请选择本次上传任务遇到同名文件时的处理方式。"
      footer={(
        <>
          <Button variant="secondary" onClick={() => onDecision('skip')}>跳过冲突文件</Button>
          <Button variant="danger" onClick={() => onDecision('overwrite')}>覆盖冲突文件</Button>
        </>
      )}
    >
      <p className={css.dialogHint}>
        <strong>{item.relativePath}</strong> 已存在。选择后，后续同类冲突将沿用这个策略。
      </p>
      <Button variant="ghost" onClick={() => onDecision('cancel')}>取消整个上传任务</Button>
    </DialogWrap>
  )
}

export function BatchDeleteDialog({ entries, onClose, onConfirm }: {
  entries: FileEntry[]
  onClose: () => void
  onConfirm: () => void
}) {
  const css = useStyles()
  const preview = entries.slice(0, 5)
  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={`将 ${entries.length} 项移入回收站？`}
      description="批量删除确认"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="danger" onClick={onConfirm} disabled={entries.length === 0}>移入回收站</Button>
        </>
      }
    >
      <p className={css.dialogText}>
        选中的项目会移入回收站；文件夹及其内容会一起移动，之后可在回收站恢复。
      </p>
      <ul className={css.dialogList}>
        {preview.map((entry) => <li key={entry.name}>{entry.name}{entry.type === 'dir' ? '（文件夹）' : ''}</li>)}
        {entries.length > preview.length ? <li>以及其他 {entries.length - preview.length} 项</li> : null}
      </ul>
    </DialogWrap>
  )
}

export function MkdirDialog({
  open,
  onOpenChange,
  onCreated,
  sourceKey,
  currentPath,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
  sourceKey: string
  currentPath: string
}) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) { setName(''); setErr('') }
  }, [open])

  const mut = useMutation({
    mutationFn: () => createFolder(sourceKey, currentPath, name.trim()),
    onSuccess: () => { onOpenChange(false); onCreated() },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '创建失败'),
  })

  function submit() {
    setErr('')
    if (!name.trim()) { setErr('请输入目录名'); return }
    if (/[\\/:*?"<>|]/.test(name)) { setErr('目录名不能包含 / \\ : * ? " < > |'); return }
    mut.mutate()
  }

  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title="新建文件夹"
      description={`在 ${currentPath} 下创建一个新目录。`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={submit} disabled={mut.isPending || !name.trim()}>
            {mut.isPending ? '创建中…' : '创建'}
          </Button>
        </>
      }
    >
      <FormField label="目录名" required error={err}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：旅行" />
      </FormField>
    </DialogWrap>
  )
}

export function RenameDialog({
  sourceKey,
  currentPath,
  target,
  onClose,
  onChanged,
}: {
  sourceKey: string
  currentPath: string
  target: { name: string }
  onClose: () => void
  onChanged: () => void
}) {
  const [name, setName] = useState(target.name)
  const [err, setErr] = useState('')
  useEffect(() => { setName(target.name); setErr('') }, [target.name])

  const fullPath = currentPath === '/' ? `/${target.name}` : `${currentPath}/${target.name}`
  const mut = useMutation({
    mutationFn: () => renameFile(sourceKey, fullPath, name.trim()),
    onSuccess: () => { onClose(); onChanged() },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '重命名失败'),
  })

  function submit() {
    setErr('')
    if (!name.trim()) { setErr('请输入名称'); return }
    if (name.trim() === target.name) { onClose(); return }
    if (/[\\/:*?"<>|]/.test(name)) { setErr('名称不能包含 / \\ : * ? " < > |'); return }
    mut.mutate()
  }

  return (
    <DialogWrap
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      title="重命名"
      description={fullPath}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={submit} disabled={mut.isPending || !name.trim()}>
            {mut.isPending ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <FormField label="新名称" required error={err}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
    </DialogWrap>
  )
}

export function BatchShareDialog({ sourceKey, currentPath, entries, onClose }: {
  sourceKey: string
  currentPath: string
  entries: FileEntry[]
  onClose: () => void
}) {
  const css = useStyles()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [expiryDays, setExpiryDays] = useState('0')
  const [maxDownloads, setMaxDownloads] = useState('0')
  const [validationError, setValidationError] = useState('')
  const [running, setRunning] = useState(false)
  const [attempted, setAttempted] = useState(0)
  const [attemptTotal, setAttemptTotal] = useState(entries.length)
  const [currentName, setCurrentName] = useState('')
  const [created, setCreated] = useState<FileShare[]>([])
  const [failed, setFailed] = useState<Array<{ entry: FileEntry; message: string }>>([])
  const [copied, setCopied] = useState(false)

  async function createShares(targets: FileEntry[]) {
    const days = Number(expiryDays)
    const limit = Number(maxDownloads || 0)
    if (!Number.isInteger(limit) || limit < 0 || limit > 1_000_000) {
      setValidationError('下载次数上限必须是 0 到 1000000 之间的整数')
      return
    }
    if (password.trim() && [...password.trim()].length < 4) {
      setValidationError('访问密码至少需要 4 个字符')
      return
    }
    setValidationError('')
    setRunning(true)
    setAttempted(0)
    setAttemptTotal(targets.length)
    setFailed([])
    const newShares: FileShare[] = []
    const errors: Array<{ entry: FileEntry; message: string }> = []
    const expiresAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : undefined
    for (const entry of targets) {
      setCurrentName(entry.name)
      try {
        newShares.push(await createShare({
          sourceKey,
          path: joinPath(currentPath, entry.name),
          password: password.trim(),
          expiresAt,
          maxDownloads: limit,
        }))
      } catch (error) {
        errors.push({ entry, message: error instanceof ApiRequestError ? error.message : '创建失败' })
      }
      setAttempted((count) => count + 1)
    }
    setCreated((previous) => [...previous, ...newShares])
    setFailed(errors)
    setCurrentName('')
    setRunning(false)
    if (newShares.length > 0) await queryClient.invalidateQueries({ queryKey: ['shares'] })
  }

  async function copyLinks() {
    try {
      await navigator.clipboard.writeText(created.map((share) => `${share.name}\t${share.url}`).join('\n'))
      setCopied(true)
    } catch {
      setValidationError('复制失败，请检查浏览器剪贴板权限。')
    }
  }

  const started = running || attempted > 0 || created.length > 0 || failed.length > 0
  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open && !running) onClose() }}
      title="批量创建分享"
      description={`为所选的 ${entries.length} 个文件和文件夹创建独立分享链接。`}
      wide
      footer={running ? (
        <Button disabled>正在创建 {attempted} / {attemptTotal}</Button>
      ) : started ? (
        <>
          {created.length > 0 && <Button variant="secondary" onClick={() => void copyLinks()} icon={<IconCopy size={14} />}>{copied ? '已复制全部链接' : '复制全部链接'}</Button>}
          {failed.length > 0 && <Button onClick={() => void createShares(failed.map((item) => item.entry))}>重试失败项（{failed.length}）</Button>}
          <Button onClick={onClose}>完成</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={() => void createShares(entries)}>创建 {entries.length} 个分享</Button>
        </>
      )}
    >
      {!started ? (
        <FormLayout>
          <FormField label="访问密码" hint="选填；所有分享使用相同密码。">
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="留空表示无需密码" maxLength={128} disabled={running} />
          </FormField>
          <FormField label="有效期" hint="所有分享使用相同有效期。">
            <Select value={expiryDays} onValueChange={setExpiryDays} options={[
              { value: '0', label: '永久有效' }, { value: '1', label: '1 天' }, { value: '7', label: '7 天' },
              { value: '30', label: '30 天' }, { value: '90', label: '90 天' },
            ]} ariaLabel="分享有效期" />
          </FormField>
          <FormField label="下载次数上限" hint="填写 0 表示不限制；目录分享按文件下载计数。" error={validationError}>
            <Input type="number" min={0} max={1000000} step={1} value={maxDownloads} onChange={(event) => setMaxDownloads(event.target.value)} disabled={running} />
          </FormField>
        </FormLayout>
      ) : (
        <div className={css.shareResult}>
          <p role="status" aria-live="polite">{running ? `正在处理 ${attempted} / ${attemptTotal} 项：${currentName}` : `完成：${created.length} 个成功，${failed.length} 个失败`}</p>
          {created.length > 0 && <ul className={css.shareList} aria-label="已创建的分享链接">
            {created.map((share) => <li key={share.key}><a href={share.url} target="_blank" rel="noreferrer">{share.name}</a></li>)}
          </ul>}
          {failed.length > 0 && <ul className={`${css.shareList} ${css.shareErrorList}`} aria-label="创建失败的项目">
            {failed.map(({ entry, message }) => <li key={entry.name}>{entry.name}：{message}</li>)}
          </ul>}
        </div>
      )}
      {validationError && started && <Banner intent="error">{validationError}</Banner>}
    </DialogWrap>
  )
}

export function ShareDialog({
  sourceKey,
  currentPath,
  target,
  onClose,
}: {
  sourceKey: string
  currentPath: string
  target: { name: string; type: 'file' | 'dir' }
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [expiryDays, setExpiryDays] = useState('0')
  const [maxDownloads, setMaxDownloads] = useState('0')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<FileShare | null>(null)
  const [copied, setCopied] = useState(false)
  const fullPath = currentPath === '/' ? `/${target.name}` : `${currentPath}/${target.name}`

  const mutation = useMutation({
    mutationFn: () => {
      const days = Number(expiryDays)
      return createShare({
        sourceKey,
        path: fullPath,
        password: password.trim(),
        expiresAt: days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : undefined,
        maxDownloads: Number(maxDownloads || 0),
      })
    },
    onSuccess: async (share) => {
      setCreated(share)
      await queryClient.invalidateQueries({ queryKey: ['shares'] })
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : '创建分享失败'),
  })

  function submit() {
    setError('')
    const limit = Number(maxDownloads || 0)
    if (!Number.isInteger(limit) || limit < 0 || limit > 1_000_000) {
      setError('下载次数上限必须是 0 到 1000000 之间的整数')
      return
    }
    if (password.trim() && [...password.trim()].length < 4) {
      setError('访问密码至少需要 4 个字符')
      return
    }
    mutation.mutate()
  }

  async function copyCreatedLink() {
    if (!created) return
    await navigator.clipboard.writeText(created.url)
    setCopied(true)
  }

  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={created ? '分享已创建' : `分享${target.type === 'dir' ? '文件夹' : '文件'}`}
      description={fullPath}
      wide
      footer={created ? (
        <>
          <Button variant="secondary" onClick={copyCreatedLink} icon={<IconCopy size={14} />}>{copied ? '已复制' : '复制链接'}</Button>
          <Button onClick={onClose}>完成</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending ? '创建中…' : '创建分享'}
          </Button>
        </>
      )}
    >
      {created ? (
        <FormField label="分享链接" hint="链接可随时在“分享”页面复制或撤销。">
          <Input readOnly value={created.url} onFocus={(event) => event.currentTarget.select()} />
        </FormField>
      ) : (
        <FormLayout>
          <FormField label="访问密码" hint="选填；设置后访问者需要先验证密码。">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="留空表示无需密码"
              maxLength={128}
            />
          </FormField>
          <FormField label="有效期">
            <Select
              value={expiryDays}
              onValueChange={setExpiryDays}
              options={[
                { value: '0', label: '永久有效' },
                { value: '1', label: '1 天' },
                { value: '7', label: '7 天' },
                { value: '30', label: '30 天' },
                { value: '90', label: '90 天' },
              ]}
              ariaLabel="分享有效期"
            />
          </FormField>
          <FormField label="下载次数上限" hint="填写 0 表示不限制；目录内每次文件下载均计数。" error={error}>
            <Input
              type="number"
              min={0}
              max={1000000}
              step={1}
              value={maxDownloads}
              onChange={(event) => setMaxDownloads(event.target.value)}
            />
          </FormField>
        </FormLayout>
      )}
    </DialogWrap>
  )
}

export function DeleteDialog({
  sourceKey,
  currentPath,
  target,
  onClose,
  onChanged,
  onError,
}: {
  sourceKey: string
  currentPath: string
  target: { name: string; type: string }
  onClose: () => void
  onChanged: () => void
  onError: (error: unknown) => void
}) {
  const css = useStyles()
  const fullPath = currentPath === '/' ? `/${target.name}` : `${currentPath}/${target.name}`
  const isDir = target.type === 'dir'
  const mut = useMutation({
    mutationFn: () => deleteFile(sourceKey, fullPath),
    onSuccess: () => { onClose(); onChanged() },
    onError,
  })

  return (
    <DialogWrap
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      title="移入回收站"
      description={fullPath}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="danger" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? '移动中…' : '移入回收站'}
          </Button>
        </>
      }
    >
      <p className={css.dialogText}>
        {isDir
          ? `目录「${target.name}」及其中内容会移入回收站，可在永久清理前恢复。`
          : `「${target.name}」会移入回收站，可在永久清理前恢复。`}
      </p>
    </DialogWrap>
  )
}

// --- 工具 ---
