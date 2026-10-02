import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetchBlob, ApiRequestError } from '../api/client'
import { listFiles, fetchMySources, type UserSource } from '../api/sources'
import {
  closeCollection,
  copyIntoSend,
  createCollection,
  createSend,
  finalizeSend,
  listMyCollections,
  listMySends,
  listSendFilesByID,
  listSubmissions,
  revokeSend,
  saveSubmissionToFiles,
  uploadToSend,
  type TransferCollection,
  type TransferFile,
  type TransferSend,
  type TransferSubmission,
  downloadBlob,
} from '../api/transfers'
import { AppShell } from '../components/layout/AppShell'
import { QrCodeDialog } from '../components/share/QrCodeDialog'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { DialogWrap } from '../components/ui/Dialog'
import { Field } from '../components/ui/Field'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { IconCloud, IconCopy, IconDownload, IconPlus } from '../components/ui/Icon'
import * as fieldCss from '../components/ui/Field.css'
import { formatBytes } from '../utils/format'
import { vars } from '../styles/theme.css'
import { toastError, toastSuccess } from '../components/ui/Toast'
import * as css from './TransferCenter.css'

// 流转中心（2.0 Phase 5）：发件包草稿管理、定稿分享、历史与撤销。

const expiryOptions = [
  { value: '24', label: '1 天' },
  { value: '168', label: '7 天' },
  { value: '720', label: '30 天' },
  { value: '0', label: '永不过期' },
]

const statusLabels: Record<TransferSend['status'], { label: string; color: 'green' | 'gray' | 'red' | 'blue' }> = {
  draft: { label: '草稿', color: 'blue' },
  active: { label: '进行中', color: 'green' },
  revoked: { label: '已撤销', color: 'red' },
  expired: { label: '已过期', color: 'gray' },
}

export function TransferCenterPage() {
  const queryClient = useQueryClient()
  const sends = useQuery({ queryKey: ['transfer-sends'], queryFn: listMySends })
  const [createOpen, setCreateOpen] = useState(false)
  const [draftID, setDraftID] = useState<number | null>(null)
  const [qrTarget, setQrTarget] = useState<TransferSend | null>(null)
  const [pickupOnce, setPickupOnce] = useState<{ code: string; publicKey: string; sendID: number } | null>(null)

  const revoke = useMutation({
    mutationFn: revokeSend,
    onSuccess: async () => {
      toastSuccess('发件包已撤销，接收方将无法访问')
      await queryClient.invalidateQueries({ queryKey: ['transfer-sends'] })
    },
    onError: (error) => toastError(error instanceof ApiRequestError ? error.message : '撤销失败'),
  })

  return (
    <AppShell title="流转中心">
      <div className={css.pageHeader}>
        <h1 className={css.pageTitle}>流转中心</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus size={14} /> 新建发件包
        </Button>
      </div>

      <section className={css.panel} aria-label="发件包列表">
        {sends.isPending ? <div className={css.emptyState}>正在加载…</div> : null}
        {sends.isSuccess && sends.data.length === 0 ? (
          <div className={css.emptyState}>
            <span className={css.emptyIcon}><IconCloud size={34} /></span>
            <strong>还没有发件包</strong>
            <span>创建一个发件包，把文件通过链接 + 取件码交付给对方。</span>
          </div>
        ) : null}
        {sends.data?.map((send) => (
          <SendRow
            key={send.id}
            send={send}
            onOpenDraft={() => setDraftID(send.id)}
            onShowQR={() => setQrTarget(send)}
            onRevoke={() => revoke.mutate(send.id)}
          />
        ))}
      </section>

      {createOpen ? (
        <CreateSendDialog
          onClose={() => setCreateOpen(false)}
          onCreated={({ send, pickup_code }) => {
            setCreateOpen(false)
            void queryClient.invalidateQueries({ queryKey: ['transfer-sends'] })
            // 取件码弹层必须独占展示：与草稿弹层同时挂载会触发弹层库的关闭竞态。
            setPickupOnce({ code: pickup_code, publicKey: send.public_key, sendID: send.id })
          }}
        />
      ) : null}
      {draftID !== null ? (
        <DraftDialog
          transferID={draftID}
          onClose={() => {
            setDraftID(null)
            void queryClient.invalidateQueries({ queryKey: ['transfer-sends'] })
          }}
        />
      ) : null}
      {qrTarget ? (
        <QrCodeDialog
          url={`${window.location.origin}/pickup/${qrTarget.public_key}`}
          name={qrTarget.title || '发件包'}
          onClose={() => setQrTarget(null)}
        />
      ) : null}
      {pickupOnce ? (
        <PickupCodeOnceDialog
          code={pickupOnce.code}
          publicKey={pickupOnce.publicKey}
          onSaved={() => {
            const sendID = pickupOnce.sendID
            setPickupOnce(null)
            void queryClient.invalidateQueries({ queryKey: ['transfer-sends'] })
            setDraftID(sendID)
          }}
        />
      ) : null}

      <CollectionsSection />
    </AppShell>
  )
}

// --- 收集任务（2.0 Phase 6） ---

const collectionStatusLabels: Record<TransferCollection['status'], { label: string; color: 'green' | 'gray' | 'red' | 'blue' }> = {
  active: { label: '收集中', color: 'green' },
  closed: { label: '已关闭', color: 'gray' },
  revoked: { label: '已撤销', color: 'red' },
  expired: { label: '已过期', color: 'gray' },
}

function CollectionsSection() {
  const queryClient = useQueryClient()
  const collections = useQuery({ queryKey: ['transfer-collections'], queryFn: listMyCollections })
  const [createOpen, setCreateOpen] = useState(false)
  const [codeOnce, setCodeOnce] = useState<{ code: string; publicKey: string; collectionID: number } | null>(null)
  const [inboxID, setInboxID] = useState<number | null>(null)

  const close = useMutation({
    mutationFn: closeCollection,
    onSuccess: async () => {
      toastSuccess('收集任务已关闭，不再接受新提交')
      await queryClient.invalidateQueries({ queryKey: ['transfer-collections'] })
    },
    onError: (error) => toastError(error instanceof ApiRequestError ? error.message : '关闭失败'),
  })

  return (
    <>
      <div className={css.pageHeader} style={{ marginTop: vars.space.xl }}>
        <h2 className={css.pageTitle}>收集任务</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus size={14} /> 新建收集任务
        </Button>
      </div>
      <section className={css.panel} aria-label="收集任务列表">
        {collections.isPending ? <div className={css.emptyState}>正在加载…</div> : null}
        {collections.isSuccess && collections.data.length === 0 ? (
          <div className={css.emptyState}>
            <strong>还没有收集任务</strong>
            <span>创建一个收集链接，外部访客凭收件码向你提交文件。</span>
          </div>
        ) : null}
        {collections.data?.map((collection) => {
          const status = collectionStatusLabels[collection.status]
          const link = `${window.location.origin}/collect/${collection.public_key}`
          return (
            <article key={collection.id} className={css.row} aria-label={`收集任务 ${collection.title || collection.public_key}`}>
              <div className={css.rowMain}>
                <h3 className={css.rowTitle}>{collection.title || '（无标题）'}</h3>
                <div className={css.rowMeta}>
                  <Badge color={status.color}>{status.label}</Badge>
                  <span>已收 {collection.total_files} 个文件 · {formatBytes(collection.total_size)}</span>
                  <span>{collection.expires_at ? `有效期至 ${new Date(collection.expires_at).toLocaleString()}` : '永不过期'}</span>
                </div>
              </div>
              <div className={css.rowActions}>
                {collection.status === 'active' ? (
                  <>
                    <Button variant="secondary" onClick={() => setInboxID(collection.id)}>收件箱</Button>
                    <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(link); toastSuccess('收集链接已复制') }}>
                      <IconCopy size={14} /> 复制链接
                    </Button>
                    <Button variant="dangerGhost" onClick={() => close.mutate(collection.id)}>关闭</Button>
                  </>
                ) : null}
                {collection.status !== 'active' ? (
                  <Button variant="secondary" onClick={() => setInboxID(collection.id)}>收件箱</Button>
                ) : null}
              </div>
            </article>
          )
        })}
      </section>

      {createOpen ? (
        <CreateCollectionDialog
          onClose={() => setCreateOpen(false)}
          onCreated={({ collection, code }) => {
            setCreateOpen(false)
            void queryClient.invalidateQueries({ queryKey: ['transfer-collections'] })
            setCodeOnce({ code, publicKey: collection.public_key, collectionID: collection.id })
          }}
        />
      ) : null}
      {codeOnce ? (
        <PickupCodeOnceDialog
          code={codeOnce.code}
          publicKey={codeOnce.publicKey}
          collectBase
          onSaved={() => {
            const collectionID = codeOnce.collectionID
            setCodeOnce(null)
            void queryClient.invalidateQueries({ queryKey: ['transfer-collections'] })
            setInboxID(collectionID)
          }}
        />
      ) : null}
      {inboxID !== null ? (
        <InboxDialog
          collectionID={inboxID}
          onClose={() => {
            setInboxID(null)
            void queryClient.invalidateQueries({ queryKey: ['transfer-collections'] })
          }}
        />
      ) : null}
    </>
  )
}

function CreateCollectionDialog({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (result: { collection: TransferCollection; code: string }) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [expiry, setExpiry] = useState('168')
  const [password, setPassword] = useState('')
  const [maxFileSizeMB, setMaxFileSizeMB] = useState('')
  const [maxTotalSizeMB, setMaxTotalSizeMB] = useState('')
  const [requireName, setRequireName] = useState(true)
  const [requireNote, setRequireNote] = useState(false)
  const [allowedExts, setAllowedExts] = useState('')
  const [err, setErr] = useState('')

  const mutation = useMutation({
    mutationFn: () => createCollection({
      title: title.trim(),
      description: description.trim(),
      expires_in_hours: Number(expiry),
      password: password.trim() ? password : undefined,
      max_file_size_mb: maxFileSizeMB.trim() ? Number(maxFileSizeMB) : undefined,
      max_total_size_mb: maxTotalSizeMB.trim() ? Number(maxTotalSizeMB) : undefined,
      require_name: requireName,
      require_note: requireNote,
      allowed_exts: allowedExts.split(/[,\s]+/).map((ext) => ext.trim()).filter(Boolean),
    }),
    onSuccess: onCreated,
    onError: (error) => setErr(error instanceof ApiRequestError ? error.message : '创建失败'),
  })

  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title="新建收集任务"
      description="生成收集链接与收件码；外部访客只能提交自己的文件，无法查看他人提交。"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={mutation.isPending || !title.trim()} onClick={() => { setErr(''); mutation.mutate() }}>
            {mutation.isPending ? '创建中…' : '创建'}
          </Button>
        </>
      }
    >
      <Field label="标题" required>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="收集任务标题" placeholder="2026 年 10 月作业收集" />
      </Field>
      <Field label="说明">
        <Input value={description} onChange={(event) => setDescription(event.target.value)} aria-label="收集任务说明" />
      </Field>
      <Field label="有效期">
        <Select value={expiry} onValueChange={setExpiry} options={expiryOptions} ariaLabel="收集任务有效期" />
      </Field>
      <Field label="访问密码（可选）">
        <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} aria-label="收集任务访问密码" />
      </Field>
      <div className={css.constraintGrid}>
        <Field label="单文件上限 MB（可选）">
          <Input type="number" min="1" value={maxFileSizeMB} onChange={(event) => setMaxFileSizeMB(event.target.value)} aria-label="单文件上限 MB" />
        </Field>
        <Field label="总量上限 MB（可选）">
          <Input type="number" min="1" value={maxTotalSizeMB} onChange={(event) => setMaxTotalSizeMB(event.target.value)} aria-label="总量上限 MB" />
        </Field>
      </div>
      <Field label="允许的扩展名（可选，空格或逗号分隔）" hint="留空表示不限制类型，例如 pdf png docx。">
        <Input value={allowedExts} onChange={(event) => setAllowedExts(event.target.value)} aria-label="允许的扩展名" />
      </Field>
      <Field label="提交表单要求">
        <div style={{ display: 'grid', gap: 6 }}>
          <label className={fieldCss.checkboxRow}>
            <input type="checkbox" className={fieldCss.checkbox} checked={requireName} onChange={(event) => setRequireName(event.target.checked)} />
            要求提交者姓名
          </label>
          <label className={fieldCss.checkboxRow}>
            <input type="checkbox" className={fieldCss.checkbox} checked={requireNote} onChange={(event) => setRequireNote(event.target.checked)} />
            要求备注
          </label>
        </div>
      </Field>
      {err ? <div role="alert" style={{ color: 'var(--color-danger, #c0392b)', fontSize: 13 }}>{err}</div> : null}
    </DialogWrap>
  )
}

function InboxDialog({ collectionID, onClose }: { collectionID: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const collections = useQuery({ queryKey: ['transfer-collections'], queryFn: listMyCollections })
  const collection = collections.data?.find((item) => item.id === collectionID)
  const submissions = useQuery({ queryKey: ['transfer-inbox', collectionID], queryFn: () => listSubmissions(collectionID) })
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const [saveSource, setSaveSource] = useState('')
  const [savePath, setSavePath] = useState('')
  const [downloading, setDownloading] = useState(false)
  const usableSources = sources.data ?? []

  const save = useMutation({
    mutationFn: (submissionID: number) => saveSubmissionToFiles(collectionID, submissionID, saveSource, savePath.trim()),
    onSuccess: (saved) => {
      toastSuccess(`已保存 ${saved.length} 个文件到 ${saved[0] ? `${saveSource}:${saved[0]}` : '目标目录'}`)
      void queryClient.invalidateQueries({ queryKey: ['transfer-inbox', collectionID] })
    },
    onError: (error) => toastError(error instanceof ApiRequestError ? error.message : '保存失败'),
  })

  async function downloadFile(submission: TransferSubmission, file: { id: number; relative_path: string }) {
    setDownloading(true)
    try {
      const response = await apiFetchBlob(
        `/api/v1/transfer-collections/${collectionID}/submissions/${submission.id}/files/${file.id}/download`,
      )
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)
      const filename = decodeURIComponent(match?.[1] ?? file.relative_path.split('/').pop() ?? 'file')
      downloadBlob(await response.blob(), filename)
    } catch (error) {
      toastError(error instanceof ApiRequestError ? error.message : '下载失败')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={`收件箱：${collection?.title ?? ''}`}
      description={`已收 ${collection?.total_files ?? 0} 个文件 · ${formatBytes(collection?.total_size ?? 0)}`}
      wide
      footer={<Button variant="ghost" onClick={onClose}>关闭</Button>}
    >
      {submissions.isPending ? <div className={css.browserEmpty}>加载中…</div> : null}
      {submissions.isSuccess && submissions.data.length === 0 ? (
        <div className={css.browserEmpty}>还没有收到提交。</div>
      ) : null}
      {submissions.data?.map((submission) => (
        <SubmissionCard
          key={submission.id}
          submission={submission}
          usableSources={usableSources}
          saveSource={saveSource}
          onSourceChange={setSaveSource}
          savePath={savePath}
          onPathChange={setSavePath}
          onSave={() => save.mutate(submission.id)}
          saving={save.isPending}
          downloading={downloading}
          onDownload={downloadFile}
        />
      ))}
    </DialogWrap>
  )
}

function SubmissionCard({ submission, usableSources, saveSource, onSourceChange, savePath, onPathChange, onSave, saving, downloading, onDownload }: {
  submission: TransferSubmission
  usableSources: UserSource[]
  saveSource: string
  onSourceChange: (value: string) => void
  savePath: string
  onPathChange: (value: string) => void
  onSave: () => void
  saving: boolean
  downloading: boolean
  onDownload: (submission: TransferSubmission, file: { id: number; relative_path: string }) => Promise<void>
}) {
  return (
    <section className={css.submissionCard} aria-label={`提交 ${submission.submitter_name || submission.id}`}>
      <header className={css.submissionHeader}>
        <strong>{submission.submitter_name || '匿名提交'}</strong>
        <span className={css.submissionMeta}>
          {new Date(submission.created_at).toLocaleString()} · {submission.file_count} 个文件 · {formatBytes(submission.total_size)}
        </span>
      </header>
      {submission.note ? <p className={css.submissionNote}>{submission.note}</p> : null}
      <ul className={css.draftFiles}>
        {submission.files.map((file) => (
          <li key={file.id} className={css.draftFileRow}>
            <span className={css.draftFilePath}>{file.relative_path}</span>
            <span className={css.draftFileSize}>{formatBytes(file.size)}</span>
            <Button
              variant="secondary"
              disabled={downloading}
              onClick={() => void onDownload(submission, file)}
              aria-label={`下载 ${file.relative_path}`}
            >
              <IconDownload size={14} /> 下载
            </Button>
          </li>
        ))}
      </ul>
      <div className={css.saveRow}>
        <Select
          value={saveSource ? String(usableSources.findIndex((item) => item.key === saveSource)) : ''}
          onValueChange={(index) => onSourceChange(usableSources[Number(index)]?.key ?? '')}
          options={usableSources.map((item, index) => ({ value: String(index), label: item.name }))}
          ariaLabel="保存目标存储源"
          placeholder="选择目标存储源…"
        />
        <Input
          value={savePath}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder="目标目录（源内相对路径）"
          aria-label="保存目标目录"
        />
        <Button variant="secondary" disabled={saving || !saveSource} onClick={onSave}>
          {saving ? '保存中…' : '保存到文件'}
        </Button>
      </div>
    </section>
  )
}

function SendRow({
  send,
  onOpenDraft,
  onShowQR,
  onRevoke,
}: {
  send: TransferSend
  onOpenDraft: () => void
  onShowQR: () => void
  onRevoke: () => void
}) {
  const status = statusLabels[send.status]
  const link = `${window.location.origin}/t/${send.public_key}`
  return (
    <article className={css.row} aria-label={`发件包 ${send.title || send.public_key}`}>
      <div className={css.rowMain}>
        <h3 className={css.rowTitle}>{send.title || '（无标题）'}</h3>
        <div className={css.rowMeta}>
          <Badge color={status.color}>{status.label}</Badge>
          <span>{send.total_files} 个文件 · {formatBytes(send.total_size)}</span>
          {send.max_downloads != null ? (
            <span>已下载 {send.download_count}/{send.max_downloads}</span>
          ) : (
            <span>已下载 {send.download_count} 次</span>
          )}
          <span>{send.expires_at ? `有效期至 ${new Date(send.expires_at).toLocaleString()}` : '永不过期'}</span>
        </div>
      </div>
      <div className={css.rowActions}>
        {send.status === 'draft' ? (
          <Button variant="secondary" onClick={onOpenDraft}>继续编辑</Button>
        ) : null}
        {send.status === 'active' ? (
          <>
            <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(link); toastSuccess('取件链接已复制') }}>
              <IconCopy size={14} /> 复制链接
            </Button>
            <Button variant="ghost" onClick={onShowQR}>二维码</Button>
          </>
        ) : null}
        {send.status === 'draft' || send.status === 'active' ? (
          <Button variant="dangerGhost" onClick={onRevoke}>撤销</Button>
        ) : null}
      </div>
    </article>
  )
}

function CreateSendDialog({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (result: { send: TransferSend; pickup_code: string }) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [expiry, setExpiry] = useState('168')
  const [maxDownloads, setMaxDownloads] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  const mutation = useMutation({
    mutationFn: () => createSend({
      title: title.trim(),
      description: description.trim(),
      expires_in_hours: Number(expiry),
      max_downloads: maxDownloads.trim() ? Number(maxDownloads) : undefined,
      password: password.trim() ? password : undefined,
    }),
    onSuccess: onCreated,
    onError: (error) => setErr(error instanceof ApiRequestError ? error.message : '创建失败'),
  })

  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title="新建发件包"
      description="创建后获得取件链接与取件码；对方需凭取件码领取文件。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={mutation.isPending || !title.trim()} onClick={() => { setErr(''); mutation.mutate() }}>
            {mutation.isPending ? '创建中…' : '创建草稿'}
          </Button>
        </>
      }
    >
      <Field label="标题" required>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="发件包标题" placeholder="给客户的交付资料" />
      </Field>
      <Field label="说明" hint="会展示给取件人。">
        <Input value={description} onChange={(event) => setDescription(event.target.value)} aria-label="发件包说明" />
      </Field>
      <Field label="有效期">
        <Select value={expiry} onValueChange={setExpiry} options={expiryOptions} ariaLabel="有效期" />
      </Field>
      <Field label="下载次数上限（可选）" hint="留空表示不限制；单文件下载与整包 ZIP 都计入。">
        <Input type="number" min="1" value={maxDownloads} onChange={(event) => setMaxDownloads(event.target.value)} aria-label="下载次数上限" />
      </Field>
      <Field label="访问密码（可选）">
        <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} aria-label="访问密码" />
      </Field>
      {err ? <div role="alert" style={{ color: 'var(--color-danger, #c0392b)', fontSize: 13 }}>{err}</div> : null}
    </DialogWrap>
  )
}

function PickupCodeOnceDialog({ code, publicKey, collectBase, onSaved }: {
  code: string
  publicKey: string
  collectBase?: boolean
  onSaved: () => void
}) {
  const [copied, setCopied] = useState('')
  const link = `${window.location.origin}${collectBase ? '/collect' : '/pickup'}/${publicKey}`
  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(''), 1500)
  }
  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onSaved() }}
      title="请立即保存取件码"
      description="取件码只显示这一次，关闭后无法再次查看。"
      footer={<Button onClick={onSaved}>保存并继续编辑</Button>}
    >
      <div className={css.pickupOnce}>
        <div className={css.pickupCodeRow}>
          <code className={css.pickupCode}>{code}</code>
          <Button variant="secondary" onClick={() => void copy(code, 'code')}>{copied === 'code' ? '已复制' : '复制取件码'}</Button>
        </div>
        <div className={css.pickupCodeRow}>
          <code className={css.pickupLink}>{link}</code>
          <Button variant="secondary" onClick={() => void copy(link, 'link')}>{copied === 'link' ? '已复制' : '复制链接'}</Button>
        </div>
        <p className={css.pickupHint}>对方在取件页输入取件码即可下载文件{`（`}链接本身不含取件码{`）`}。</p>
      </div>
    </DialogWrap>
  )
}

// 草稿管理：文件清单 + 直传（文件/文件夹）+ 从已有文件复制 + 定稿。
function DraftDialog({ transferID, onClose }: { transferID: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const [storeOpen, setStoreOpen] = useState(false)
  const [err, setErr] = useState('')

  const sends = useQuery({ queryKey: ['transfer-sends'], queryFn: listMySends })
  const send = sends.data?.find((item) => item.id === transferID)

  const upload = useMutation({
    mutationFn: async (files: FileList | File[]) => {
      const queued = Array.from(files)
      for (const file of queued) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        await uploadToSend(transferID, relativePath, file)
      }
      return queued.length
    },
    onSuccess: async (count) => {
      toastSuccess(`${count} 个文件已加入发件包`)
      await queryClient.invalidateQueries({ queryKey: ['transfer-sends'] })
      await queryClient.invalidateQueries({ queryKey: ['transfer-draft', transferID] })
    },
    onError: (error) => setErr(error instanceof ApiRequestError ? error.message : '上传失败'),
  })
  const finalize = useMutation({
    mutationFn: () => finalizeSend(transferID),
    onSuccess: async () => {
      toastSuccess('发件包已定稿，取件链接已生效')
      await queryClient.invalidateQueries({ queryKey: ['transfer-sends'] })
      onClose()
    },
    onError: (error) => setErr(error instanceof ApiRequestError ? error.message : '定稿失败'),
  })
  const revoke = useMutation({
    mutationFn: () => revokeSend(transferID),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transfer-sends'] })
      onClose()
    },
    onError: (error) => setErr(error instanceof ApiRequestError ? error.message : '撤销失败'),
  })

  const total = send?.total_files ?? 0
  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={`编辑发件包：${send?.title ?? ''}`}
      description={`已包含 ${total} 个文件 · ${formatBytes(send?.total_size ?? 0)}`}
      wide
      footer={
        <>
          <Button variant="dangerGhost" onClick={() => revoke.mutate()}>撤销发件包</Button>
          <Button disabled={finalize.isPending || total === 0} onClick={() => finalize.mutate()}>
            {finalize.isPending ? '定稿中…' : '定稿并生成取件链接'}
          </Button>
        </>
      }
    >
      <div className={css.draftActions}>
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>上传文件</Button>
        <Button variant="secondary" onClick={() => folderInput.current?.click()}>上传文件夹</Button>
        <Button variant="secondary" onClick={() => setStoreOpen(true)}>从已有文件添加</Button>
      </div>
      <input
        ref={fileInput}
        className={css.hiddenInput}
        type="file"
        multiple
        aria-label="上传文件输入"
        data-testid="transfer-upload-files"
        onChange={(event) => {
          // 先物化文件列表：清空 input.value 会让 FileList 变空，mutation 是异步的。
          const picked = Array.from(event.target.files ?? [])
          if (picked.length > 0) upload.mutate(picked)
          event.target.value = ''
        }}
      />
      <input
        ref={folderInput}
        className={css.hiddenInput}
        type="file"
        multiple
        aria-label="上传文件夹输入"
        data-testid="transfer-upload-folder"
        // @ts-expect-error 目录上传属性
        webkitdirectory="true"
        onChange={(event) => {
          // 先物化文件列表：清空 input.value 会让 FileList 变空，mutation 是异步的。
          const picked = Array.from(event.target.files ?? [])
          if (picked.length > 0) upload.mutate(picked)
          event.target.value = ''
        }}
      />
      <DraftFileList transferID={transferID} />
      {err ? <div role="alert" style={{ color: 'var(--color-danger, #c0392b)', fontSize: 13 }}>{err}</div> : null}
      {storeOpen ? (
        <StoreBrowserDialog
          onAdd={async (sourceKey, paths) => {
            await copyIntoSend(transferID, sourceKey, paths)
            toastSuccess(`已加入 ${paths.length} 项`)
            await queryClient.invalidateQueries({ queryKey: ['transfer-sends'] })
            await queryClient.invalidateQueries({ queryKey: ['transfer-draft', transferID] })
            setStoreOpen(false)
          }}
          onClose={() => setStoreOpen(false)}
        />
      ) : null}
    </DialogWrap>
  )
}

function DraftFileList({ transferID }: { transferID: number }) {
  const files = useQuery({
    queryKey: ['transfer-draft', transferID],
    queryFn: () => listSendFilesByID(transferID),
  })
  if (files.isPending) return <div className={css.browserEmpty}>加载中…</div>
  if (files.isSuccess && files.data.length === 0) {
    return <div className={css.browserEmpty}>还没有文件：上传文件或从已有文件添加。</div>
  }
  return (
    <ul className={css.draftFiles} aria-label="发件包文件">
      {files.data?.map((file: TransferFile) => (
        <li key={file.id} className={css.draftFileRow}>
          <span className={css.draftFilePath}>{file.relative_path}</span>
          <span className={css.draftFileSize}>{formatBytes(file.size)}</span>
        </li>
      ))}
    </ul>
  )
}

// 从已有文件添加：浏览可访问的存储源，勾选文件/文件夹加入草稿。
function StoreBrowserDialog({ onAdd, onClose }: {
  onAdd: (sourceKey: string, paths: string[]) => Promise<void>
  onClose: () => void
}) {
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const usable = sources.data ?? []
  const [sourceKey, setSourceKey] = useState('')
  const source = usable.find((item) => item.key === sourceKey)
  const [path, setPath] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const listing = useQuery({
    queryKey: ['store-browser', sourceKey, path],
    queryFn: () => listFiles(sourceKey, { path: '/' + path, page: 1, pageSize: 200 }),
    enabled: sourceKey !== '',
  })

  const entries = listing.data?.items ?? []
  const selected = useMemo(() => Object.keys(checked).filter((key) => checked[key]), [checked])
  function open(entryPath: string, type: string) {
    if (type === 'dir') {
      setPath(entryPath)
      setChecked({})
    }
  }
  function breadcrumb(): ReactNode {
    const segments = path.split('/').filter(Boolean)
    return (
      <div className={css.breadcrumb}>
        <button type="button" onClick={() => { setPath(''); setChecked({}) }}>{source?.name ?? '存储源'}</button>
        {segments.map((segment, index) => (
          <button
            key={segment}
            type="button"
            onClick={() => {
              setPath(segments.slice(0, index + 1).join('/'))
              setChecked({})
            }}
          >
            / {segment}
          </button>
        ))}
      </div>
    )
  }

  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title="从已有文件添加"
      description="勾选文件或文件夹；复制进发件包的是快照，之后修改原文件不影响交付内容。"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            disabled={selected.length === 0}
            onClick={() => {
              if (!sourceKey) return
              void onAdd(sourceKey, selected)
            }}
          >
            添加所选（{selected.length}）
          </Button>
        </>
      }
    >
      <Field label="存储源">
        <Select
          value={sourceKey ? String(usable.findIndex((item) => item.key === sourceKey)) : ''}
          onValueChange={(index) => {
            setSourceKey(usable[Number(index)]?.key ?? '')
            setPath('')
            setChecked({})
          }}
          options={usable.map((item, index) => ({ value: String(index), label: item.name }))}
          ariaLabel="选择存储源"
          placeholder="选择存储源…"
        />
      </Field>
      {sourceKey ? breadcrumb() : null}
      <div className={css.browserList} role="listbox" aria-label="文件列表">
        {listing.isPending ? <div className={css.browserEmpty}>加载中…</div> : null}
        {listing.isSuccess && entries.length === 0 ? <div className={css.browserEmpty}>目录为空</div> : null}
        {entries.map((entry) => {
          const entryPath = path ? `${path}/${entry.name}` : entry.name
          return (
            <label key={entry.name} className={css.browserRow}>
              <input
                type="checkbox"
                checked={checked[entryPath] ?? false}
                onChange={(event) => setChecked((prev) => ({ ...prev, [entryPath]: event.target.checked }))}
              />
              {entry.type === 'dir' ? (
                <button type="button" className={css.browserDirButton} onClick={() => open(entryPath, entry.type)}>
                  {entry.name}/
                </button>
              ) : (
                <span className={css.browserName}>{entry.name} <small>{formatBytes(entry.size)}</small></span>
              )}
            </label>
          )
        })}
      </div>
    </DialogWrap>
  )
}
