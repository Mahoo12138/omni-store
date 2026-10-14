import { useEffect, useId, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import { lookupCollection, submitToCollection, unlockCollection, type CollectionPublicInfo } from '../api/transfers'
import { PublicTransferShell } from '../components/transfer/PublicTransferShell'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { IconCheck, IconClose, IconFolder, IconKey, IconUpload } from '../components/ui/Icon'
import { formatBytes } from '../utils/format'
import * as css from './PublicCollect.css'

type Access = { token: string; expires_at: string }
type PickedFile = { id: number; relativePath: string; file: File }

export function PublicCollectPage() {
  const { publicKey } = useParams({ from: '/collect/$publicKey' })
  return <CollectionTask key={publicKey} publicKey={publicKey} />
}

// The keyed task owns authentication and the upload draft together. Re-authentication
// keeps the draft; opening a different collection cannot inherit either state.
function CollectionTask({ publicKey }: { publicKey: string }) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const nextFileID = useRef(0)
  const autoStarted = useRef(false)
  const dragDepth = useRef(0)
  const noteID = useId()
  const [access, setAccess] = useState<Access | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [sessionMessage, setSessionMessage] = useState('')
  const [unavailable, setUnavailable] = useState('')
  const [picked, setPicked] = useState<PickedFile[]>([])
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ count: number; size: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [readingFiles, setReadingFiles] = useState(false)
  const info = useQuery({ queryKey: ['public-collection', publicKey], queryFn: () => lookupCollection(publicKey), retry: false })
  const requiresCode = info.data?.require_code !== false
  const protectedTask = requiresCode || info.data?.has_password === true

  const unlock = useMutation({
    mutationFn: (credentials: { code: string; password: string }) => unlockCollection(publicKey, credentials.code, credentials.password),
    onSuccess: (data) => {
      setAccess(data)
      setAuthError('')
      setSessionMessage((current) => current ? '验证已恢复，已选文件和填写内容已保留，请再次提交。' : '')
    },
    onError: (cause) => {
      if (isUnavailable(cause)) setUnavailable(cause.message)
      else setAuthError(errorMessage(cause, '验证失败，请重试。'))
    },
  })
  const { mutate: unlockAccess } = unlock
  useEffect(() => {
    if (!info.data || info.isFetching || protectedTask || access || unavailable || autoStarted.current) return
    autoStarted.current = true
    unlockAccess({ code: '', password: '' })
  }, [info.data, info.isFetching, protectedTask, access, unavailable, unlockAccess])

  function resetAccess() {
    setAccess(null)
    setAuthError('')
    setError('')
    setSessionMessage('访问会话已失效，请重新验证。已选文件和填写内容已保留。')
    autoStarted.current = false
  }

  async function handleSubmitFailure(cause: unknown) {
    if (cause instanceof ApiRequestError && cause.code === 'TRANSFER_EXPIRED') {
      setUnavailable(cause.message)
      return
    }
    if (cause instanceof ApiRequestError && (cause.code === 'UNAUTHORIZED' || cause.code === 'FILE_NOT_FOUND')) {
      // Expired sessions and removed tasks share a 404 in the existing API.
      // Refresh the public metadata before asking the visitor to authenticate again.
      try {
        const latest = await lookupCollection(publicKey)
        queryClient.setQueryData(['public-collection', publicKey], latest)
        resetAccess()
      } catch (lookupError) {
        if (isUnavailable(lookupError)) setUnavailable(lookupError.message)
        else setError(errorMessage(lookupError, '无法确认收集任务状态，请重试。已选文件已保留。'))
      }
      return
    }
    setError(errorMessage(cause, '提交失败，请重试。已选文件和填写内容已保留。'))
  }

  const submit = useMutation({
    mutationFn: () => {
      if (!access) throw new Error('请先完成访问验证')
      return submitToCollection(publicKey, access.token, {
        name: name.trim(), note: note.trim(),
        files: picked.map(({ relativePath, file }) => ({ relativePath, file })),
      })
    },
    onSuccess: (submission) => {
      setDone({ count: submission.file_count, size: submission.total_size })
      setPicked([])
      setError('')
      setSessionMessage('')
    },
    onError: handleSubmitFailure,
  })

  function addFiles(files: Array<{ relativePath: string; file: File }>) {
    if (files.length === 0) { setError('没有找到可上传的文件。空文件夹不会提交。'); return }
    const additions = files.map((item) => ({ ...item, id: nextFileID.current++ }))
    setPicked((current) => [...current, ...additions])
    setError('')
  }

  const title = info.data?.title || '提交文件'
  if (info.isPending) return <PublicTransferShell title="提交文件"><div className={css.workbench}><div className={css.state} role="status">正在加载收集任务…</div></div></PublicTransferShell>
  if (info.isError || !info.data || unavailable) {
    const message = unavailable || errorMessage(info.error, '收集任务加载失败')
    const terminal = unavailable !== '' || isUnavailable(info.error)
    return <PublicTransferShell title="提交文件"><div className={css.workbench}><div className={css.state} role="alert">
      <h2>{message}</h2><p>{terminal ? '该任务目前无法接收文件，请联系收集者确认。' : '暂时无法加载收集任务，请重试。'}{picked.length > 0 ? '已选文件和填写内容仍保留在当前页面。' : ''}</p>
      {!terminal ? <Button variant="secondary" onClick={() => void info.refetch()}>重新加载</Button> : null}
    </div></div></PublicTransferShell>
  }

  const constraints = fileConstraints(info.data)
  const summary = <div className={css.summary}>
    <span>收集文件</span>{info.data.expires_at ? <span>截止 {new Date(info.data.expires_at).toLocaleString()}</span> : null}
  </div>
  if (!access) return <PublicTransferShell title={title} description={info.data.description || '将文件提交给收集者。'} summary={summary}>
    <div className={css.workbench}>
      {protectedTask ? <section className={css.auth}>
        <div className={css.authHeader}><span className={css.authIcon}><IconKey size={28} /></span><h2>验证后提交文件</h2><p className={css.hint}>请填写收集者提供的{requiresCode ? '收件码' : ''}{requiresCode && info.data.has_password ? '和' : ''}{info.data.has_password ? '访问密码' : ''}。</p></div>
        {sessionMessage ? <p className={css.hint} role="status">{sessionMessage}</p> : null}
        <form className={css.form} onSubmit={(event) => {
          event.preventDefault(); setAuthError('');
          unlock.mutate({ code: requiresCode ? code.trim() : '', password: info.data.has_password ? password : '' })
        }}>
          {requiresCode ? <Input label="收件码" autoFocus value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={8} autoComplete="off" required disabled={unlock.isPending} /> : null}
          {info.data.has_password ? <Input label="访问密码" aria-label="收集任务访问密码" type="password" autoFocus={!requiresCode} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={unlock.isPending} /> : null}
          {authError ? <p className={css.error} role="alert">{authError}</p> : null}
          <Button type="submit" disabled={unlock.isPending || (requiresCode && !code.trim()) || (info.data.has_password && !password)}>{unlock.isPending ? '验证中…' : '继续提交'}</Button>
        </form>
      </section> : <div className={css.state}>
        {authError ? <><h2>暂时无法进入收集任务</h2><p role="alert">{authError}</p><Button variant="secondary" onClick={() => { setAuthError(''); unlock.mutate({ code: '', password: '' }) }}>重试</Button></> : <p role="status">正在准备上传…</p>}
      </div>}
    </div>
  </PublicTransferShell>

  if (done) return <PublicTransferShell title={title} description={info.data.description || '将文件提交给收集者。'} summary={summary}>
    <div className={css.workbench}><div className={css.state} role="status"><span className={css.uploadIcon}><IconCheck size={40} /></span><h2>提交成功</h2><p>已收到你的 {done.count} 个文件，共 {formatBytes(done.size)}。可以关闭此页，或继续提交。</p><Button variant="secondary" onClick={() => setDone(null)}>再提交一批</Button></div></div>
  </PublicTransferShell>

  const totalSize = picked.reduce((total, item) => total + item.file.size, 0)
  const paths = new Set<string>()
  const duplicatePaths = new Set<string>()
  for (const item of picked) { if (paths.has(item.relativePath)) duplicatePaths.add(item.relativePath); paths.add(item.relativePath) }
  const violations = picked.map((item) => duplicatePaths.has(item.relativePath) ? '存在相同路径，请移除重复文件或重新命名。' : validateFile(item, info.data))
  const busy = submit.isPending || readingFiles
  return <PublicTransferShell title={title} description={info.data.description || '选择文件，填写提交信息，然后发送给收集者。'} summary={summary}>
    <div className={css.workbench}>
      <form className={css.form} onSubmit={(event) => {
        event.preventDefault(); setError('')
        if (picked.length === 0) { setError('请选择要提交的文件。'); return }
        if (violations.some(Boolean)) { setError('请先处理文件列表中的问题，再提交。'); return }
        if (Date.parse(access.expires_at) <= Date.now()) { resetAccess(); return }
        submit.mutate()
      }}>
        <section className={css.uploadSection} aria-label="待提交文件">
          <div className={css.sectionHeading}><h2>选择文件</h2><span className={css.hint}>{picked.length > 0 ? `已选 ${picked.length} 个 · ${formatBytes(totalSize)}` : '支持多个文件和文件夹'}</span></div>
          <input ref={fileInput} className={css.hiddenInput} type="file" multiple disabled={busy} aria-label="选择要提交的文件" data-testid="collect-upload-files" onChange={(event) => { addFiles(Array.from(event.target.files ?? []).map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }))); event.target.value = '' }} />
          <input ref={folderInput} className={css.hiddenInput} type="file" multiple disabled={busy} aria-label="选择要提交的文件夹" data-testid="collect-upload-folder" {...{ webkitdirectory: '', directory: '' }} onChange={(event) => { addFiles(Array.from(event.target.files ?? []).map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }))); event.target.value = '' }} />
          <div className={css.dropZone} data-dragging={dragging} aria-disabled={busy}
            onDragEnter={(event) => { event.preventDefault(); if (busy || !event.dataTransfer.types.includes('Files')) return; dragDepth.current++; setDragging(true) }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy' }}
            onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false) }}
            onDrop={(event) => {
              event.preventDefault(); dragDepth.current = 0; setDragging(false); if (busy) return
              // Capture entries synchronously; directory traversal continues after the drop event.
              const entries = Array.from(event.dataTransfer.items).map((item) => typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null).filter((entry): entry is FileSystemEntry => entry !== null)
              const files = Array.from(event.dataTransfer.files)
              if (entries.length === 0) { addFiles(files.map((file) => ({ file, relativePath: file.name }))); return }
              setReadingFiles(true)
              void Promise.all(entries.map((entry) => readEntry(entry))).then((groups) => addFiles(groups.flat())).catch(() => setError('文件夹读取失败，请改用“选择文件夹”重试。已有文件已保留。')).finally(() => setReadingFiles(false))
            }}>
            <span className={css.uploadIcon}><IconUpload size={36} /></span>
            <p className={css.dropTitle}>{readingFiles ? '正在读取文件夹…' : dragging ? '松开即可添加文件' : '将文件或文件夹拖到这里'}</p>
            <div className={css.pickerActions}><Button type="button" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>选择文件</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => folderInput.current?.click()}><IconFolder size={16} /> 选择文件夹</Button></div>
            {constraints ? <p className={css.hint}>{constraints}</p> : null}
          </div>
          {picked.length > 0 ? <ul className={css.fileList}>{picked.map((item, index) => <li key={item.id} className={css.fileRow}>
            <div className={css.fileDetails}><span className={css.filePath}>{item.relativePath}</span>{violations[index] ? <span className={css.error}>{violations[index]}</span> : null}</div><span className={css.fileSize}>{formatBytes(item.file.size)}</span><button className={css.removeButton} type="button" aria-label={`移除 ${item.relativePath}`} disabled={busy} onClick={() => setPicked((current) => current.filter((file) => file.id !== item.id))}><IconClose size={17} /></button>
          </li>)}</ul> : null}
        </section>
        <div className={css.fields}>
          <Input label={`你的姓名${info.data.require_name ? '（必填）' : '（选填）'}`} aria-label="提交者姓名" value={name} onChange={(event) => setName(event.target.value)} required={info.data.require_name} disabled={busy} autoComplete="name" />
          <div className={css.noteField}><label className={css.label} htmlFor={noteID}>留言{info.data.require_note ? '（必填）' : '（选填）'}</label><textarea id={noteID} className={css.textarea} aria-label="提交备注" value={note} onChange={(event) => setNote(event.target.value)} required={info.data.require_note} disabled={busy} /></div>
        </div>
        {sessionMessage ? <p className={css.hint} role="status">{sessionMessage}</p> : null}
        {error ? <p className={css.error} role="alert">{error}</p> : null}
        <div className={css.footer}><p className={css.hint}>文件仅发送给收集者，你的提交不会展示给其他访客。</p><Button type="submit" disabled={busy || picked.length === 0}>{submit.isPending ? '提交中…' : '提交文件'}</Button></div>
      </form>
    </div>
  </PublicTransferShell>
}

function fileConstraints(info: CollectionPublicInfo): string {
  return [info.max_file_size != null ? `单文件不超过 ${formatBytes(info.max_file_size)}` : '', info.allowed_exts.length > 0 ? `支持 ${info.allowed_exts.map((ext) => `.${ext}`).join('、')}` : ''].filter(Boolean).join('；')
}

function validateFile(item: PickedFile, info: CollectionPublicInfo): string {
  if (info.max_file_size != null && item.file.size > info.max_file_size) return `超过单文件上限 ${formatBytes(info.max_file_size)}。`
  const filename = item.relativePath.split('/').at(-1) || item.file.name
  const dot = filename.lastIndexOf('.')
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
  if (info.allowed_exts.length > 0 && !info.allowed_exts.includes(ext)) return '收集者不接受此文件类型。'
  return ''
}

function isUnavailable(cause: unknown): cause is ApiRequestError {
  return cause instanceof ApiRequestError && (cause.code === 'TRANSFER_EXPIRED' || cause.code === 'FILE_NOT_FOUND')
}
function errorMessage(cause: unknown, fallback: string): string { return cause instanceof ApiRequestError ? cause.message : fallback }

async function readEntry(entry: FileSystemEntry, prefix = ''): Promise<Array<{ relativePath: string; file: File }>> {
  const relativePath = `${prefix}${entry.name}`
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    return [{ relativePath, file }]
  }
  if (!entry.isDirectory) return []
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const children: FileSystemEntry[] = []
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) break
    children.push(...batch)
  }
  const groups = await Promise.all(children.map((child) => readEntry(child, `${relativePath}/`)))
  return groups.flat()
}
