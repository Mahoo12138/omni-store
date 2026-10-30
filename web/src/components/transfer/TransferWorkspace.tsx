import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Tabs } from '../ui/Tabs'
import { fetchAuthStatus } from '../../api/auth'
import { apiFetchBlob } from '../../api/client'
import { fetchMySources } from '../../api/sources'
import { fetchSystemStatus } from '../../api/system'
import {
  closeCollection, copyIntoSend, createCollection, createSend, downloadBlob, finalizeSend, fetchTransferIdentity,
  getCollection, getSend, listMyCollections, listMySends, listSendFilesByID, listSubmissions,
  revokeSend, saveSubmissionToFiles, uploadToSend,
  type TransferCollection, type TransferSend, type TransferSubmission,
} from '../../api/transfers'
import { StoreBrowserDialog } from './TransferStorePicker'
import { QrCodeDialog } from '../share/QrCodeDialog'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormField } from '../shell/FormLayout'
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Checkbox,
  Input,
} from '@fluentui/react-components'
import { Banner } from '../shell/Banner'
import { ServiceStatus } from '../shell/ServiceStatus'
import { StateView } from '../shell/StateView'
import { LinkButton } from '../ui/LinkButton'
import { IconDownload, IconHistory, IconUpload } from '../ui/Icon'
import { Select } from '../ui/Select'
import { toastSuccess } from '../ui/Toast'
import { formatBytes } from '../../utils/format'
import { transferFilePath, type TransferRecordKind, type TransferWorkspaceSearch } from '../../utils/transfer-workspace'
import { useStyles } from './TransferWorkspace.styles'

type WorkspaceProps = {
  search: TransferWorkspaceSearch
  onNavigate: (search: TransferWorkspaceSearch) => void
}

type Config = {
  title: string; description: string; expiry: string; password: string; requireCode: boolean
  maxDownloads: string; requireName: boolean; requireNote: boolean
  maxFileSize: string; maxTotalSize: string; allowedExts: string
}
const initialConfig: Config = { title: '', description: '', expiry: '168', password: '', requireCode: false, maxDownloads: '', requireName: true, requireNote: false, maxFileSize: '', maxTotalSize: '', allowedExts: '' }
const expiryOptions = [{ value: '24', label: '1 天' }, { value: '168', label: '7 天' }, { value: '720', label: '30 天' }, { value: '0', label: '永不过期' }]
const statusLabels: Record<string, string> = { draft: '草稿', active: '进行中', closed: '已关闭', expired: '已过期', revoked: '已撤销' }
const message = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。'
const positiveInteger = (value: string, label: string) => {
  if (!value.trim()) return undefined
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label}必须是大于 0 的整数。`)
  return number
}

export function TransferServiceSummary() {
  const css = useStyles()
  const system = useQuery({ queryKey: ['system-status'], queryFn: fetchSystemStatus, retry: false, staleTime: 0 })
  const service = system.isError ? undefined : system.data?.transfer_center
  const value = system.isPending ? '正在检查…' : !service ? '状态未知' : service.status
  const tone = system.isPending ? 'pending' as const : !service ? 'neutral' as const : service.enabled ? 'success' as const : 'warning' as const
  return <div className={css.serviceRow}>
    <ServiceStatus label="新任务服务" value={value} tone={tone} />
    {system.isError || (!system.isPending && !service) ? <Button variant="ghost" onClick={() => void system.refetch()}>重新检查</Button> : null}
  </div>
}

export function TransferWorkspace({ search, onNavigate }: WorkspaceProps) {
  const css = useStyles()
  const auth = useQuery({ queryKey: ['auth-status'], queryFn: fetchAuthStatus, retry: false, staleTime: 0 })
  const identity = useQuery({ queryKey: ['transfer-identity', auth.data?.authenticated], queryFn: fetchTransferIdentity, retry: false, enabled: auth.isSuccess, staleTime: 0 })
  const system = useQuery({ queryKey: ['system-status'], queryFn: fetchSystemStatus, retry: false, staleTime: 0 })
  const service = system.isError ? undefined : system.data?.transfer_center
  const owner = auth.isSuccess && identity.isSuccess ? identity.data : undefined
  const ready = !!owner && !identity.isFetching
  const canUseStore = ready && owner?.kind === 'user'
  const guest = owner?.kind === 'guest'
  const canCreate = ready && service?.enabled === true
  const writing = useIsMutating({ predicate: (mutation) => String(mutation.options.mutationKey?.[0] ?? '').startsWith('transfer-write') }) > 0
  const record = (kind: TransferRecordKind, id: number) => onNavigate({ view: 'history', record: kind, id })
  const params = new URLSearchParams({ view: search.view })
  if (search.record && search.id) { params.set('record', search.record); params.set('id', String(search.id)) }
  // 身份无法确认时整个工作区都不可用：不渲染空 Tabs，也不留下上一身份的记录。
  // 这是页面级状态，恢复后页面会回到原来的 view（含 record 深链接）。
  if (auth.isError || identity.isError) {
    const retry = () => { if (auth.isError) void auth.refetch(); else void identity.refetch() }
    return <div className={css.publicWorkspace}>
      <StateView
        kind="error"
        brand
        eyebrow="文件中转 · 身份状态"
        title="收发身份暂时无法恢复"
        description="无法确认当前身份。请检查网络后重试；如果仍无法恢复，可以重新登录后再继续。"
        action={
          <>
            <Button onClick={retry}>重新检查收发身份</Button>
            <LinkButton variant="secondary" to="/login" search={{ redirect: `/transfer?${params.toString()}` }}>登录并继续</LinkButton>
          </>
        }
        status={{
          tone: 'warning',
          label: auth.isError ? '账户状态未响应' : '收发身份未响应',
          hint: '已有分享链接和收发记录不会丢失',
        }}
      />
    </div>
  }
  return <div className={css.publicWorkspace}>
    <Tabs.Root
      key={owner?.owner_key ?? 'pending'}
      className={css.tabsRoot}
      value={search.view}
      onValueChange={(value) => { if (!writing) onNavigate({ view: value as TransferWorkspaceSearch['view'] }) }}
    >
      <div className={css.modeRail}>
        <Tabs.List aria-label="中转功能">
          <Tabs.Tab value="send" ariaLabel="发送文件" disabled={writing}>
            <span className={css.modeTabContent}>
              <span className={css.modeTabIcon} aria-hidden="true"><IconUpload size={20} /></span>
              <span className={css.modeTabText}>
                <strong className={css.modeTabLabel}>发送文件</strong>
                <small className={css.modeTabHint}>交付文件</small>
              </span>
            </span>
          </Tabs.Tab>
          <Tabs.Tab value="collect" ariaLabel="收集文件" disabled={writing}>
            <span className={css.modeTabContent}>
              <span className={css.modeTabIcon} aria-hidden="true"><IconDownload size={20} /></span>
              <span className={css.modeTabText}>
                <strong className={css.modeTabLabel}>收集文件</strong>
                <small className={css.modeTabHint}>接收提交</small>
              </span>
            </span>
          </Tabs.Tab>
          <Tabs.Tab value="history" ariaLabel="收发记录" disabled={writing}>
            <span className={css.modeTabContent}>
              <span className={css.modeTabIcon} aria-hidden="true"><IconHistory size={20} /></span>
              <span className={css.modeTabText}>
                <strong className={css.modeTabLabel}>收发记录</strong>
                <small className={css.modeTabHint}>查看任务</small>
              </span>
            </span>
          </Tabs.Tab>
        </Tabs.List>
      </div>
      {auth.isPending || (auth.isSuccess && identity.isPending) ? <p className={css.text}>正在恢复收发身份…</p> : guest ? <p className={css.text}>访客身份保留至 {new Date(identity.data!.expires_at!).toLocaleString()}；记录仅存于当前浏览器，清除 Cookie 或更换设备后不可恢复。</p> : null}
      {service && !service.enabled ? <p className={css.text}>新任务服务当前不可用；已有分享链接和收发记录仍按任务状态提供访问。</p> : null}
      <Tabs.Panel keepMounted value="send" className={css.panel}>{owner ? <SendComposer canCreate={canCreate} canUseStore={canUseStore} guest={guest} onRecord={record} /> : null}</Tabs.Panel>
      <Tabs.Panel keepMounted value="collect" className={css.panel}>{owner ? <CollectionComposer canCreate={canCreate} guest={guest} onRecord={record} /> : null}</Tabs.Panel>
      <Tabs.Panel value="history" className={css.panel}>{ready && owner ? <TransferHistory key={owner.owner_key} ownerID={owner.owner_key} canUseStore={canUseStore} search={search} onNavigate={onNavigate} /> : <p className={css.text}>身份恢复后可查看自己的发送与收集记录。</p>}</Tabs.Panel>
    </Tabs.Root>
  </div>
}

function Settings({ kind, config, setConfig, disabled, guest }: { kind: TransferRecordKind; config: Config; setConfig: Dispatch<SetStateAction<Config>>; disabled: boolean; guest: boolean }) {
  const css = useStyles()
  const collect = kind === 'collect'
  const update = (key: keyof Config, value: string | boolean) => setConfig((old) => ({ ...old, [key]: value }))
  return <Accordion collapsible className={css.settings}>
    <AccordionItem value="settings">
      <AccordionHeader>{collect ? '收集设置' : '发送设置'}</AccordionHeader>
      <AccordionPanel>
        <fieldset className={css.fields} disabled={disabled}>
          <Tabs.Root defaultValue="basic">
            <Tabs.List aria-label={collect ? '收集设置分类' : '发送设置分类'}>
              <Tabs.Tab value="basic">基础</Tabs.Tab>
              {collect ? <Tabs.Tab value="information">收集信息</Tabs.Tab> : null}
              <Tabs.Tab value="files">文件</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="basic" className={css.panel}><div className={css.fields}>
              <FormField label={collect ? '收集任务有效期' : '有效期'}><Select value={config.expiry} onValueChange={(value) => update('expiry', value)} options={guest ? expiryOptions.filter((option) => option.value === '24') : expiryOptions} ariaLabel={collect ? '收集任务有效期' : '有效期'} /></FormField>
              {guest ? <p className={css.text}>此处的访客任务保留 1 天；身份更早到期时，任务随之结束。</p> : null}
              <FormField label="访问密码（可选）"><Input type="password" value={config.password} onChange={(event) => update('password', event.target.value)} aria-label={collect ? '收集任务访问密码' : '访问密码'} maxLength={128} autoComplete="new-password" /></FormField>
              <Checkbox checked={config.requireCode} onChange={(_, data) => update('requireCode', !!data.checked)} label={collect ? '启用收件码' : '启用取件码'} />
              <p className={css.text}>默认通过分享链接直接访问。设置密码或短码后，对方需要验证；短码只在创建时显示一次。</p>
            </div></Tabs.Panel>
            {collect ? <Tabs.Panel value="information" className={css.panel}><div className={css.fields}>
              <Checkbox checked={config.requireName} onChange={(_, data) => update('requireName', !!data.checked)} label="要求提交者姓名" />
              <Checkbox checked={config.requireNote} onChange={(_, data) => update('requireNote', !!data.checked)} label="要求提交备注" />
              <p className={css.text}>提交者只能上传自己的文件，收集到的内容仅由你管理。</p>
            </div></Tabs.Panel> : null}
            <Tabs.Panel value="files" className={css.panel}><div className={css.fields}>
              {collect ? <>
                <FormField label="单文件上限 MB"><Input type="number" min="1" step="1" value={config.maxFileSize} onChange={(event) => update('maxFileSize', event.target.value)} aria-label="单文件上限 MB" /></FormField>
                <FormField label="总量上限 MB"><Input type="number" min="1" step="1" value={config.maxTotalSize} onChange={(event) => update('maxTotalSize', event.target.value)} aria-label="总量上限 MB" /></FormField>
                <FormField label="允许的扩展名" hint="留空表示不限制，例如 pdf png docx。"><Input value={config.allowedExts} onChange={(event) => update('allowedExts', event.target.value)} aria-label="允许的扩展名" /></FormField>
              </> : <FormField label="下载次数上限" hint="留空表示不限制，单文件和 ZIP 下载都计入。"><Input type="number" min="1" step="1" value={config.maxDownloads} onChange={(event) => update('maxDownloads', event.target.value)} aria-label="下载次数上限" /></FormField>}
            </div></Tabs.Panel>
          </Tabs.Root>
        </fieldset>
      </AccordionPanel>
    </AccordionItem>
  </Accordion>
}

type PickedFile = { id: string; file: File; path: string; state: 'queued' | 'uploaded' | 'failed' }
function FilePicker({ files, onFiles, onRemove, disabled, testPrefix = 'transfer', onStore }: {
  files: PickedFile[]; onFiles: (files: File[]) => void; onRemove: (id: string) => void; disabled: boolean; testPrefix?: string; onStore?: () => void
}) {
  const css = useStyles()
  const input = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const selected = (list: FileList | null) => { const batch = Array.from(list ?? []); if (batch.length) onFiles(batch) }
  return <div className={css.stack}>
    <div className={css.dropZone} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) selected(event.dataTransfer.files) }}>
      <h3 className={css.subheading}>选择文件，或拖拽到这里</h3>
      <p className={css.text}>支持多个文件和整个文件夹，文件会独立保存到本次发件包。</p>
      <div className={css.actions}>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>选择文件</Button>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => folder.current?.click()}>选择文件夹</Button>
        {onStore ? <Button type="button" variant="secondary" disabled={disabled} onClick={onStore}>从已有文件添加</Button> : null}
      </div>
    </div>
    <input ref={input} className={css.hiddenInput} type="file" multiple data-testid={`${testPrefix}-upload-files`} aria-label="选择发送的文件" disabled={disabled} onChange={(event) => { selected(event.target.files); event.target.value = '' }} />
    <input ref={folder} className={css.hiddenInput} type="file" multiple {...{ webkitdirectory: '', directory: '' }} data-testid={`${testPrefix}-upload-folder`} aria-label="选择发送的文件夹" disabled={disabled} onChange={(event) => { selected(event.target.files); event.target.value = '' }} />
    {files.length ? <ul className={css.fileList} aria-label="已选文件">{files.map((item) => <li key={item.id} className={css.fileRow}>
      <div className={css.fileName}>{item.path}<div className={css.fileMeta}>{formatBytes(item.file.size)} · {item.state === 'uploaded' ? '已上传' : item.state === 'failed' ? '上传失败' : '待上传'}</div></div>
      {item.state !== 'uploaded' ? <Button type="button" variant="ghost" disabled={disabled} aria-label={`移除 ${item.path}`} onClick={() => onRemove(item.id)}>移除</Button> : null}
    </li>)}</ul> : null}
  </div>
}

function ShareLinks({ kind, task, code, onRecord }: { kind: TransferRecordKind; task: TransferSend | TransferCollection; code?: string; onRecord?: (kind: TransferRecordKind, id: number) => void }) {
  const css = useStyles()
  const [error, setError] = useState('')
  const [qr, setQR] = useState(false)
  const path = `/${kind === 'send' ? 'pickup' : 'collect'}/${task.public_key}`
  const url = new URL(path, window.location.origin).href
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); toastSuccess('已复制') } catch { setError('复制失败，请选择链接后手动复制。') }
  }
  return <div className={css.stack}>
    {code ? <div className={css.stack}><p className={css.text}>请保存{kind === 'send' ? '取件码' : '收件码'}，此码只显示一次，不包含在分享链接里。</p><code data-testid="transfer-code" className={css.code}>{code}</code><div className={css.actions}><Button type="button" variant="secondary" onClick={() => void copy(code)}>复制短码</Button></div></div> : null}
    <a href={path} target="_blank" rel="noreferrer" className={css.shareURL}>{kind === 'send' ? '打开取件页面' : '打开收集页面'}</a>
    <span className={css.text}>{url}</span>
    <div className={css.actions}>
      <Button type="button" variant="secondary" onClick={() => void copy(url)}>复制链接</Button>
      <Button type="button" variant="secondary" onClick={() => setQR(true)}>二维码</Button>
      {onRecord ? <Button type="button" variant="secondary" onClick={() => onRecord(kind, task.id)}>查看收发记录</Button> : null}
    </div>
    {error ? <Banner intent="error">{error}</Banner> : null}
    {qr ? <QrCodeDialog url={url} name={task.title} onClose={() => setQR(false)} /> : null}
  </div>
}

function CollectionComposer({ canCreate, onRecord, guest }: { canCreate: boolean; guest: boolean; onRecord: (kind: TransferRecordKind, id: number) => void }) {
  const css = useStyles()
  const defaults = { ...initialConfig, expiry: guest ? '24' : initialConfig.expiry }
  const [config, setConfig] = useState(defaults)
  const [result, setResult] = useState<{ collection: TransferCollection; code: string } | null>(null)
  const create = useMutation({
    mutationKey: ['transfer-write-create', 'collect'],
    mutationFn: () => createCollection({ title: config.title.trim(), description: config.description.trim(), expires_in_hours: Number(config.expiry), require_code: config.requireCode, password: config.password || undefined, require_name: config.requireName, require_note: config.requireNote, max_file_size_mb: positiveInteger(config.maxFileSize, '单文件上限'), max_total_size_mb: positiveInteger(config.maxTotalSize, '总量上限'), allowed_exts: config.allowedExts.split(/[,，\s]+/).map((ext) => ext.replace(/^\./, '').toLowerCase()).filter(Boolean) }),
    onSuccess: setResult,
  })
  if (result) return <section className={css.receipt} aria-label="收集任务创建结果"><h2 className={css.heading}>收集链接已生成</h2><p className={css.text}>把链接发给对方，对方打开后即可提交文件。收到的文件会出现在你的收发记录中。</p><ShareLinks kind="collect" task={result.collection} code={result.code} onRecord={onRecord} /><div className={css.actions}><Button type="button" variant="ghost" onClick={() => { setResult(null); create.reset(); setConfig(defaults) }}>再发起一次收集</Button></div></section>
  return <form className={css.composer} onSubmit={(event) => { event.preventDefault(); if (canCreate && !create.isPending) create.mutate() }}>
    <div className={css.stack}>

      <fieldset className={css.fields} disabled={create.isPending}>
        <FormField label="收集任务标题" required><Input aria-label="收集任务标题" required maxLength={200} value={config.title} onChange={(event) => setConfig({ ...config, title: event.target.value })} placeholder="例如：十月作业、项目资料" /></FormField>
        <FormField label="收集任务说明"><Input aria-label="收集任务说明" maxLength={2000} value={config.description} onChange={(event) => setConfig({ ...config, description: event.target.value })} placeholder="告诉对方需要提交什么" /></FormField>
      </fieldset>
      {create.isError ? <Banner intent="error">{message(create.error)}</Banner> : null}
      <div className={css.actions}><Button type="submit" disabled={!canCreate || create.isPending}>{create.isPending ? '正在创建…' : '生成收集链接'}</Button></div>
    </div>
    <Settings kind="collect" config={config} setConfig={setConfig} disabled={create.isPending} guest={guest} />
  </form>
}

function SendComposer({ canCreate, onRecord, guest, canUseStore }: { canCreate: boolean; guest: boolean; canUseStore: boolean; onRecord: (kind: TransferRecordKind, id: number) => void }) {
  const css = useStyles()
  const queryClient = useQueryClient()
  const defaults = { ...initialConfig, expiry: guest ? '24' : initialConfig.expiry }
  const [config, setConfig] = useState(defaults)
  const [picked, setPicked] = useState<PickedFile[]>([])
  const [draft, setDraft] = useState<{ send: TransferSend; pickup_code: string } | null>(null)
  const [result, setResult] = useState<TransferSend | null>(null)
  const [error, setError] = useState('')
  const [storeOpen, setStoreOpen] = useState(false)
  const draftFiles = useQuery({ queryKey: ['transfer-draft', draft?.send.id], queryFn: () => listSendFilesByID(draft!.send.id), enabled: !!draft, retry: false })
  const createDraft = async () => {
    if (draft) return draft
    const created = await createSend({ title: config.title.trim(), description: config.description.trim(), expires_in_hours: Number(config.expiry), require_code: config.requireCode, password: config.password || undefined, max_downloads: positiveInteger(config.maxDownloads, '下载次数上限') })
    setDraft(created)
    return created
  }
  const send = useMutation({
    mutationKey: ['transfer-write-create', 'send'],
    mutationFn: async () => {
      setError('')
      const created = await createDraft()
      try {
        for (const item of picked.filter((file) => file.state !== 'uploaded')) {
          try {
            await uploadToSend(created.send.id, item.path, item.file)
            setPicked((old) => old.map((file) => file.id === item.id ? { ...file, state: 'uploaded' } : file))
          } catch (cause) {
            setPicked((old) => old.map((file) => file.id === item.id ? { ...file, state: 'failed' } : file))
            throw cause
          }
        }
        return await finalizeSend(created.send.id)
      } finally {
        await queryClient.invalidateQueries({ queryKey: ['transfer-draft', created.send.id] })
        await queryClient.invalidateQueries({ queryKey: ['transfer-sends'] })
      }
    },
    onSuccess: setResult,
    onError: (cause) => setError(message(cause)),
  })
  const store = useMutation({ mutationKey: ['transfer-write-create', 'send'], mutationFn: async () => { setError(''); await createDraft(); setStoreOpen(true) }, onError: (cause) => setError(message(cause)) })
  const copy = useMutation({ mutationKey: ['transfer-write-create', 'send'], mutationFn: async ({ sourceKey, paths }: { sourceKey: string; paths: string[] }) => { if (!draft) throw new Error('请先创建草稿。'); try { await copyIntoSend(draft.send.id, sourceKey, paths); setStoreOpen(false) } finally { await queryClient.invalidateQueries({ queryKey: ['transfer-draft', draft.send.id] }); await queryClient.invalidateQueries({ queryKey: ['transfer-sends'] }) } } })
  const busy = send.isPending || store.isPending || copy.isPending
  function select(files: File[]) {
    const paths = new Set(picked.map((item) => item.path))
    const added: PickedFile[] = []
    for (const file of files) {
      const path = transferFilePath(file)
      if (paths.has(path)) { setError(`已选择同名文件「${path}」，请先移除再选择。`); continue }
      paths.add(path); added.push({ id: crypto.randomUUID(), file, path, state: 'queued' })
    }
    setPicked((old) => [...old, ...added])
  }
  if (result) return <section className={css.receipt} aria-label="发送结果"><h2 className={css.heading}>文件已发送</h2><p className={css.text}>{result.total_files} 个文件 · {formatBytes(result.total_size)}。分享链接已生效，对方可直接打开取件页面。</p><ShareLinks kind="send" task={result} code={draft?.pickup_code} onRecord={onRecord} /><div className={css.actions}><Button type="button" variant="ghost" onClick={() => { setResult(null); setDraft(null); setPicked([]); setConfig(defaults); setError(''); send.reset() }}>再发送一批</Button></div></section>
  return <>
    <form className={css.composer} onSubmit={(event) => { event.preventDefault(); if (canCreate && !busy) send.mutate() }}>
      <div className={css.stack}>
        <fieldset className={css.fields} disabled={busy || !!draft}>
          <FormField label="发件包标题" required><Input aria-label="发件包标题" required maxLength={200} value={config.title} onChange={(event) => setConfig({ ...config, title: event.target.value })} placeholder="例如：项目交付资料" /></FormField>
          <FormField label="发件包说明"><Input aria-label="发件包说明" maxLength={2000} value={config.description} onChange={(event) => setConfig({ ...config, description: event.target.value })} placeholder="给收件人留句话" /></FormField>
        </fieldset>
        <FilePicker files={picked} onFiles={select} onRemove={(id) => setPicked((old) => old.filter((item) => item.id !== id))} disabled={!canCreate || busy} onStore={canUseStore ? () => { if (!config.title.trim()) { setError('请先填写发件包标题。'); return } store.mutate() } : undefined} />
        {draftFiles.data?.length ? <p className={css.text}>草稿已保存 {draftFiles.data.length} 个文件 · {formatBytes(draftFiles.data.reduce((total, file) => total + file.size, 0))}</p> : null}
        {draft?.pickup_code && !send.isPending ? <><p className={css.text}>请先保存取件码，此码只显示一次。</p><code data-testid="transfer-code" className={css.code}>{draft.pickup_code}</code></> : null}
        {error ? <Banner intent="error">{error}</Banner> : null}
        <div className={css.actions}>
          <Button type="submit" disabled={!canCreate || busy || (!picked.length && !draftFiles.data?.length)}>{send.isPending ? '正在发送…' : draft ? '重试未完成文件' : '发送文件'}</Button>
          {draft ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onRecord('send', draft.send.id)}>继续编辑草稿</Button> : null}
        </div>
      </div>
      <Settings kind="send" config={config} setConfig={setConfig} disabled={busy || !!draft} guest={guest} />
    </form>
    {storeOpen && draft ? <StoreBrowserDialog onClose={() => setStoreOpen(false)} onAdd={(sourceKey, paths) => copy.mutateAsync({ sourceKey, paths })} /> : null}
  </>
}

function TransferHistory({ ownerID, canUseStore, search, onNavigate }: { ownerID: string; canUseStore: boolean } & WorkspaceProps) {
  const css = useStyles()
  const sends = useQuery({ queryKey: ['transfer-sends', ownerID], queryFn: listMySends, retry: false })
  const collections = useQuery({ queryKey: ['transfer-collections', ownerID], queryFn: listMyCollections, retry: false })
  if (search.record && search.id) return <RecordDetail key={`${search.record}-${search.id}`} ownerID={ownerID} canUseStore={canUseStore} kind={search.record} id={search.id} onBack={() => onNavigate({ view: 'history' })} />
  const records = [
    ...(sends.data ?? []).map((task) => ({ kind: 'send' as const, task })),
    ...(collections.data ?? []).map((task) => ({ kind: 'collect' as const, task })),
  ].sort((a, b) => new Date(b.task.created_at).getTime() - new Date(a.task.created_at).getTime())
  const loading = sends.isPending || collections.isPending
  const error = sends.isError ? sends.error : collections.isError ? collections.error : null
  const retry = () => { void sends.refetch(); void collections.refetch() }
  const sendCount = sends.data?.length ?? 0
  const collectCount = collections.data?.length ?? 0
  return <section className={css.stack} aria-label="收发记录">
    <header className={css.ledgerHeader}>
      <div className={css.ledgerCopy}>
        <h2 className={css.ledgerTitle}>全部记录</h2>
        <p className={css.text}>发送与收集任务按创建时间排列。</p>
      </div>
      <div className={css.ledgerCounts}>
        <span className={css.ledgerCount} data-kind="send"><IconUpload size={14} aria-hidden="true" />发送 {sendCount}</span>
        <span className={css.ledgerCount} data-kind="collect"><IconDownload size={14} aria-hidden="true" />收集 {collectCount}</span>
      </div>
    </header>
    {loading ? <p className={css.text}>正在加载记录…</p> : null}
    {error ? <Banner intent="error" action={<Button variant="secondary" onClick={retry}>重新加载记录</Button>}>{message(error)}</Banner> : null}
    {!loading && !error && records.length === 0 ? (
      <StateView layout="plain" kind="empty" title="还没有发送记录" description="发送或收集文件后，任务会出现在这里。" />
    ) : null}
    {records.length > 0 ? (
      <div className={css.recordList}>
        {records.map(({ kind, task }) => (
          <article key={`${kind}-${task.id}`} className={css.recordRow} aria-label={`${kind === 'send' ? '发件包' : '收集任务'} ${task.title || task.public_key}`}>
            <span className={css.recordIcon} data-kind={kind} aria-hidden="true">
              {kind === 'send' ? <IconUpload size={16} /> : <IconDownload size={16} />}
            </span>
            <div className={css.recordMain}>
              <div className={css.recordTitleRow}>
                <span className={css.recordKind} data-kind={kind}>{kind === 'send' ? '发件' : '收集'}</span>
                <h3 className={css.subheading}>{task.title || '未命名任务'}</h3>
              </div>
              <TaskMeta task={task} />
            </div>
            <div className={css.recordAction}>
              <Button variant="secondary" onClick={() => onNavigate({ view: 'history', record: kind, id: task.id })}>查看任务</Button>
            </div>
          </article>
        ))}
      </div>
    ) : null}
  </section>
}

function TaskMeta({ task }: { task: TransferSend | TransferCollection }) {
  const css = useStyles()
  return <div className={css.meta}><Badge color={task.status === 'active' ? 'green' : task.status === 'draft' ? 'blue' : 'gray'}>{statusLabels[task.status] ?? task.status}</Badge><span>{task.total_files} 个文件 · {formatBytes(task.total_size)}</span><span>{task.expires_at ? `有效期至 ${new Date(task.expires_at).toLocaleString()}` : '永不过期'}</span></div>
}

function RecordDetail({ ownerID, canUseStore, kind, id, onBack }: { ownerID: string; canUseStore: boolean; kind: TransferRecordKind; id: number; onBack: () => void }) {
  const css = useStyles()
  const queryClient = useQueryClient()
  const task = useQuery<TransferSend | TransferCollection>({ queryKey: ['transfer-record', ownerID, kind, id], queryFn: () => kind === 'send' ? getSend(id) : getCollection(id), retry: false })
  const writing = useIsMutating({ mutationKey: ['transfer-write', id] }) > 0
  const refreshRecord = async () => {
    await Promise.all([
      task.refetch(),
      queryClient.invalidateQueries({ queryKey: [kind === 'send' ? 'transfer-draft' : 'transfer-inbox', id] }),
    ])
  }
  const stop = useMutation({
    mutationKey: ['transfer-write', id],
    mutationFn: () => kind === 'send' ? revokeSend(id) : closeCollection(id),
    onSuccess: async () => { await task.refetch(); await queryClient.invalidateQueries({ queryKey: [kind === 'send' ? 'transfer-sends' : 'transfer-collections'] }) },
  })
  return <section className={css.stack} aria-label="任务详情">
    <div className={css.actions}><Button variant="ghost" disabled={writing || stop.isPending} onClick={onBack}>返回收发记录</Button><Button variant="secondary" disabled={writing || stop.isPending || task.isFetching} onClick={() => void refreshRecord()}>刷新记录</Button></div>
    {task.isPending ? <p className={css.text}>正在加载任务…</p> : task.isError || !task.data ? <div className={css.stack}><h2 className={css.heading}>任务无法访问</h2><Banner intent="error">{message(task.error)}</Banner></div> : <>
      <div className={css.detailHeader}><div className={css.stack}><h2 className={css.heading}>{task.data.title || '未命名任务'}</h2><TaskMeta task={task.data} />{task.data.description ? <p className={css.text}>{task.data.description}</p> : null}</div>
        <div className={css.actions}>{(task.data.status === 'active' || task.data.status === 'draft') ? <Button variant="dangerGhost" disabled={stop.isPending || writing} onClick={() => stop.mutate()}>{kind === 'send' ? '撤销' : '关闭收集'}</Button> : null}</div>
      </div>
      {stop.isError ? <Banner intent="error">{message(stop.error)}</Banner> : null}
      <div className={css.detail}>
        <div>{kind === 'send' ? <SendRecord canUseStore={canUseStore} send={task.data as TransferSend} onChanged={() => task.refetch()} /> : <CollectionInbox canUseStore={canUseStore} collection={task.data as TransferCollection} />}</div>
        <aside className={css.stack} aria-label="任务管理"><h3 className={css.subheading}>任务管理</h3><p className={css.text}>访问密码：{task.data.has_password ? '已设置' : '未设置'}<br />{kind === 'send' ? '取件码' : '收件码'}：{task.data.require_code ? '已启用，请使用创建时保存的短码' : '未启用，直接打开链接'}</p>
          {kind === 'collect' ? <CollectionConstraints collection={task.data as TransferCollection} /> : null}
          {task.data.status === 'active' ? <ShareLinks kind={kind} task={task.data} /> : null}
          {task.data.status === 'draft' ? <p className={css.text}>完成上传并定稿后，分享链接才会生效。</p> : null}
        </aside>
      </div>
    </>}
  </section>
}

function CollectionConstraints({ collection }: { collection: TransferCollection }) {
  const css = useStyles()
  return <p className={css.text}>姓名：{collection.require_name ? '必填' : '可选'}<br />备注：{collection.require_note ? '必填' : '可选'}<br />文件类型：{collection.allowed_exts.length ? collection.allowed_exts.join('、') : '不限制'}<br />单文件上限：{collection.max_file_size ? formatBytes(collection.max_file_size) : '不限制'}<br />总量上限：{collection.max_total_size ? formatBytes(collection.max_total_size) : '不限制'}</p>
}

function SendRecord({ send, onChanged, canUseStore }: { send: TransferSend; canUseStore: boolean; onChanged: () => Promise<unknown> }) {
  const css = useStyles()
  const queryClient = useQueryClient()
  const files = useQuery({ queryKey: ['transfer-draft', send.id], queryFn: () => listSendFilesByID(send.id), retry: false })
  const [picked, setPicked] = useState<PickedFile[]>([])
  const [storeOpen, setStoreOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const refresh = async () => { await files.refetch(); await onChanged(); await queryClient.invalidateQueries({ queryKey: ['transfer-sends'] }) }
  const upload = useMutation({
    mutationKey: ['transfer-write', send.id],
    mutationFn: async () => {
      try {
        for (const item of picked.filter((file) => file.state !== 'uploaded')) {
          try { await uploadToSend(send.id, item.path, item.file); setPicked((old) => old.map((file) => file.id === item.id ? { ...file, state: 'uploaded' } : file)) }
          catch (cause) { setPicked((old) => old.map((file) => file.id === item.id ? { ...file, state: 'failed' } : file)); throw cause }
        }
      } finally { await refresh() }
    },
    onSuccess: () => setPicked([]),
  })
  const finalize = useMutation({ mutationKey: ['transfer-write', send.id], mutationFn: () => finalizeSend(send.id), onSuccess: refresh })
  const copy = useMutation({ mutationKey: ['transfer-write', send.id], mutationFn: async ({ sourceKey, paths }: { sourceKey: string; paths: string[] }) => { try { await copyIntoSend(send.id, sourceKey, paths); setStoreOpen(false) } finally { await refresh() } } })
  const writing = useIsMutating({ mutationKey: ['transfer-write', send.id] }) > 0
  const busy = upload.isPending || finalize.isPending || copy.isPending || writing
  function pick(batch: FileList | null) {
    const inputFiles = Array.from(batch ?? [])
    setPicked((old) => {
      const occupied = new Set([...old.map((item) => item.path), ...(files.data ?? []).map((item) => item.relative_path)])
      return [...old, ...inputFiles.filter((file) => { const path = transferFilePath(file); if (occupied.has(path)) return false; occupied.add(path); return true }).map((file): PickedFile => ({ id: crypto.randomUUID(), file, path: transferFilePath(file), state: 'queued' }))]
    })
  }
  return <div className={css.stack}>
    <h3 className={css.subheading}>文件</h3>
    {files.isPending ? <p className={css.text}>正在加载文件…</p> : files.isError ? <Banner intent="error">{message(files.error)}</Banner> : !files.data?.length ? <StateView layout="plain" kind="empty" title="还没有文件" description="上传文件，或从已有文件添加。" /> : <ul className={css.fileList} aria-label="发件包文件">{files.data.map((file) => <li className={css.fileRow} key={file.id}><span className={css.fileName}>{file.relative_path}</span><span className={css.fileMeta}>{formatBytes(file.size)}</span></li>)}</ul>}
    {send.status === 'draft' ? <>
      <div className={css.actions}><Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>上传文件</Button><Button variant="secondary" disabled={busy} onClick={() => folderInput.current?.click()}>上传文件夹</Button>{canUseStore ? <Button variant="secondary" disabled={busy} onClick={() => setStoreOpen(true)}>从已有文件添加</Button> : null}</div>
      <input ref={fileInput} className={css.hiddenInput} type="file" multiple data-testid="transfer-record-upload-files" disabled={busy} onChange={(event) => { pick(event.target.files); event.target.value = '' }} />
      <input ref={folderInput} className={css.hiddenInput} type="file" multiple {...{ webkitdirectory: '', directory: '' }} data-testid="transfer-record-upload-folder" disabled={busy} onChange={(event) => { pick(event.target.files); event.target.value = '' }} />
      {picked.length ? <><ul className={css.fileList} aria-label="待上传文件">{picked.map((file) => <li className={css.fileRow} key={file.id}><span className={css.fileName}>{file.path} · {file.state === 'uploaded' ? '已上传' : file.state === 'failed' ? '上传失败' : '待上传'}</span>{file.state !== 'uploaded' ? <Button variant="ghost" disabled={busy} onClick={() => setPicked((old) => old.filter((item) => item.id !== file.id))}>移除</Button> : null}</li>)}</ul><div className={css.actions}><Button disabled={busy} onClick={() => upload.mutate()}>{upload.isError ? '重试未完成文件' : '上传所选文件'}</Button></div></> : null}
      {upload.isError || finalize.isError ? <Banner intent="error">{message(upload.error ?? finalize.error)}</Banner> : null}
      <div className={css.actions}><Button disabled={busy || picked.some((item) => item.state !== 'uploaded') || !files.data?.length} onClick={() => finalize.mutate()}>{finalize.isPending ? '定稿中…' : '定稿并生成取件链接'}</Button></div>
      {storeOpen ? <StoreBrowserDialog onClose={() => setStoreOpen(false)} onAdd={(sourceKey, paths) => copy.mutateAsync({ sourceKey, paths })} /> : null}
    </> : null}
  </div>
}

function CollectionInbox({ collection, canUseStore }: { collection: TransferCollection; canUseStore: boolean }) {
  const css = useStyles()
  const submissions = useQuery({ queryKey: ['transfer-inbox', collection.id], queryFn: () => listSubmissions(collection.id), retry: false })
  return <div className={css.stack}><h3 className={css.subheading}>收到的文件</h3>
    {submissions.isPending ? <p className={css.text}>正在加载提交…</p> : submissions.isError ? <Banner intent="error" action={<Button variant="secondary" onClick={() => void submissions.refetch()}>重新加载提交</Button>}>{message(submissions.error)}</Banner> : !submissions.data?.length ? <StateView layout="plain" kind="empty" title="还没有收到提交" description="分享收集链接，对方可直接打开上传。" /> : submissions.data.map((submission) => <SubmissionFiles key={submission.id} canUseStore={canUseStore} collectionID={collection.id} submission={submission} />)}
  </div>
}

function SubmissionFiles({ collectionID, submission, canUseStore }: { collectionID: number; submission: TransferSubmission; canUseStore: boolean }) {
  const css = useStyles()
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources, retry: false, enabled: canUseStore })
  const [sourceKey, setSourceKey] = useState('')
  const [path, setPath] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const save = useMutation({ mutationFn: () => saveSubmissionToFiles(collectionID, submission.id, sourceKey, path.trim()), onSuccess: (saved) => toastSuccess(`已保存 ${saved.length} 个文件到目标目录`) })
  async function download(file: { id: number; relative_path: string }) {
    setDownloading(true); setDownloadError('')
    try {
      const response = await apiFetchBlob(`/api/v1/transfer-collections/${collectionID}/submissions/${submission.id}/files/${file.id}/download`)
      downloadBlob(await response.blob(), file.relative_path.split('/').pop() || '文件')
    } catch (cause) { setDownloadError(message(cause)) } finally { setDownloading(false) }
  }
  return <section className={css.submission} aria-label={`提交 ${submission.submitter_name || submission.id}`}>
    <h4 className={css.subheading}>{submission.submitter_name || '匿名提交'}</h4><p className={css.text}>{new Date(submission.created_at).toLocaleString()} · {submission.file_count} 个文件 · {formatBytes(submission.total_size)}</p>
    {submission.note ? <p className={css.text}>{submission.note}</p> : null}
    <ul className={css.fileList}>{submission.files.map((file) => <li className={css.fileRow} key={file.id}><span className={css.fileName}>{file.relative_path}</span><span className={css.fileMeta}>{formatBytes(file.size)}</span><Button variant="secondary" disabled={downloading} aria-label={`下载 ${file.relative_path}`} onClick={() => void download(file)}>下载</Button></li>)}</ul>
    {canUseStore ? <div className={css.saveRow}>
      <Select value={sourceKey} onValueChange={setSourceKey} options={(sources.data ?? []).map((source) => ({ value: source.key, label: source.name }))} ariaLabel="保存目标存储源" placeholder="选择目标存储源…" />
      <Input value={path} onChange={(event) => setPath(event.target.value)} aria-label="保存目标目录" placeholder="目标目录（源内相对路径）" />
      <Button variant="secondary" disabled={save.isPending || !sourceKey} onClick={() => save.mutate()}>{save.isPending ? '保存中…' : '保存到文件'}</Button>
    </div> : null}
    {canUseStore && sources.isError ? <Banner intent="error">{message(sources.error)}</Banner> : null}
    {save.isError || downloadError ? <Banner intent="error">{downloadError || message(save.error)}</Banner> : null}
  </section>
}
