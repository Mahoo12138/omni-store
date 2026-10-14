import { useState, type FormEvent } from 'react'
import { Tabs } from '@base-ui-components/react/tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminExportSystemConfig, adminGetAnonymousSettings, adminGetBranding,
  adminGetImageBedRetention, adminListCapabilities, adminListSources,
  adminSetAnonymousSettings, adminSetBranding, adminSetImageBedRetention, adminUpdateCapability,
  type AdminSource, type CapabilityBinding, type ImageBedRetention, type SiteCapability,
} from '../../api/admin'
import { apiFetch, ApiRequestError } from '../../api/client'
import { fetchSystemStatus } from '../../api/system'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { DialogWrap } from '../../components/ui/Dialog'
import { Field } from '../../components/ui/Field'
import * as fieldCss from '../../components/ui/Field.css'
import { IconDownload } from '../../components/ui/Icon'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import * as css from './AdminOverview.css'
import * as siteCss from './SiteSettings.css'

type SiteTab = 'services' | 'general'
const siteServices: { key: SiteCapability; name: string; description: string; bindingHint: string }[] = [
  {
    key: 'public_drive', name: '公开网盘',
    description: '全站唯一的匿名只读文件空间，可浏览和下载绑定源中的普通文件。',
    bindingHint: '启用后，任何人都可浏览绑定源中的普通文件。更换源会立即切换公开目录。',
  },
  {
    key: 'image_bed', name: '快速图床',
    description: '统一管理登录上传、匿名上传和图片保留策略。',
    bindingHint: '新上传使用绑定源；换源或停用服务不会撤销已有图片地址。',
  },
  {
    key: 'transfer_center', name: '文件中转',
    description: '通过发件包交付文件，或创建收集任务接收文件。',
    bindingHint: '新任务使用绑定源；已有任务保留原来的存储位置和有效期。停用服务不等于撤销已有链接。',
  },
]
const fetchAnonymousStatus = () => apiFetch<{ max_file_size_mb: number; enabled: boolean }>('/api/v1/image-bed/anonymous-status')

export function SiteSettingsSection({ tab, onTabChange }: { tab: SiteTab; onTabChange: (tab: SiteTab) => void }) {
  return (
    <div className={siteCss.root}>
      <div>
        <h2 className={css.sectionTitle}>站点配置</h2>
        <p className={css.sectionHint}>管理全站服务、实例信息与配置备份。</p>
      </div>
      <Tabs.Root value={tab} onValueChange={(value) => onTabChange(value as SiteTab)} className={siteCss.tabs}>
        <Tabs.List className={siteCss.tabList} aria-label="站点配置">
          <Tabs.Tab className={siteCss.tab} value="services">站点服务</Tabs.Tab>
          <Tabs.Tab className={siteCss.tab} value="general">通用配置</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="services" className={siteCss.panel}><SiteServicesSection /></Tabs.Panel>
        <Tabs.Panel value="general" className={siteCss.panel}>
          <BrandingSection />
          <SiteRuntimeSection />
          <BackupSection />
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  )
}

function SiteServicesSection() {
  const queryClient = useQueryClient()
  const capabilities = useQuery({ queryKey: ['admin-capabilities'], queryFn: adminListCapabilities, retry: false })
  const sources = useQuery({ queryKey: ['admin-sources'], queryFn: adminListSources, retry: false })
  const [editing, setEditing] = useState<SiteCapability | null>(null)
  const [message, setMessage] = useState<{ key: SiteCapability; text: string } | null>(null)
  const refresh = async () => {
    await Promise.all(['admin-capabilities', 'admin-anon-settings', 'anon-status', 'system-status', 'admin-overview'].map(
      (key) => queryClient.invalidateQueries({ queryKey: [key] }),
    ))
  }
  if (!capabilities.data || !sources.data) {
    const error = capabilities.error || sources.error
    return (
      <section className={css.section}><div className={css.sectionBody}>
        {error ? <><div role="alert" className={siteCss.error}>站点服务加载失败：{error.message}</div><Button variant="secondary" onClick={() => { void capabilities.refetch(); void sources.refetch() }}>重试</Button></>
          : <span role="status" className={css.kvLabel}>正在加载站点服务…</span>}
      </div></section>
    )
  }
  const editingBinding = capabilities.data.find((item) => item.capability === editing)
  const editingService = siteServices.find((item) => item.key === editing)
  return (
    <>
      {siteServices.map((service) => {
        const binding = capabilities.data.find((item) => item.capability === service.key)
        const source = sources.data.find((item) => item.key === binding?.source_key)
        return (
          <article className={css.section} key={service.key} aria-label={`站点服务 ${service.name}`}>
            <header className={css.sectionHeaderWithAction}>
              <div className={css.sectionHeaderCopy}>
                <h3 className={css.sectionTitle}>{service.name}</h3>
                <p className={css.sectionHint}>{service.description}</p>
              </div>
              <Button variant="secondary" disabled={!binding} onClick={() => { setEditing(service.key); setMessage(null) }}>配置</Button>
            </header>
            <div className={css.sectionBody}>
              <dl className={siteCss.facts}>
                <div><dt>服务状态</dt><dd>
                  {!binding ? <Badge color="red">配置缺失</Badge>
                    : !binding.source_key ? <Badge color="gray">未绑定</Badge>
                    : !binding.enabled ? <Badge color="gray">已关闭</Badge>
                    : !source ? <Badge color="red">绑定源不存在</Badge>
                    : source.is_disabled ? <Badge color="red">存储源已禁用</Badge>
                    : <Badge color="green">已启用</Badge>}
                </dd></div>
                <div><dt>绑定存储源</dt><dd className={siteCss.source}>
                  <span>{binding?.source_name || '未绑定'}</span>
                  {source ? <span className={siteCss.path}>{source.root_path}</span> : null}
                </dd></div>
              </dl>
              {service.key === 'image_bed' && binding ? <ImageBedOptions usable={binding.enabled && !!source && !source.is_disabled} /> : null}
              {message?.key === service.key ? <div role="status" className={siteCss.message}>{message.text}</div> : null}
            </div>
          </article>
        )
      })}
      {editingBinding && editingService ? (
        <SiteServiceDialog
          key={editingBinding.capability} binding={editingBinding} service={editingService} sources={sources.data}
          onClose={() => setEditing(null)}
          onSaved={async () => { await refresh(); setMessage({ key: editingBinding.capability, text: `${editingService.name}设置已保存。` }); setEditing(null) }}
        />
      ) : null}
    </>
  )
}

function SiteServiceDialog({ binding, service, sources, onClose, onSaved }: {
  binding: CapabilityBinding
  service: typeof siteServices[number]
  sources: AdminSource[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(binding.enabled)
  const [sourceKey, setSourceKey] = useState(binding.source_key ?? '')
  const [revision, setRevision] = useState(binding.revision)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState('')
  const mutation = useMutation({
    mutationFn: () => adminUpdateCapability(binding.capability, { enabled, storage_source_key: sourceKey, expected_revision: revision }),
    onSuccess: onSaved,
    onError: async (e) => {
      setError(e instanceof Error ? e.message : '保存服务设置失败')
      if (e instanceof ApiRequestError && e.code === 'CONFLICT') {
        try {
          const latest = await adminListCapabilities()
          queryClient.setQueryData(['admin-capabilities'], latest)
          const current = latest.find((item) => item.capability === binding.capability)
          if (current) {
            setRevision(current.revision)
            setConflict(`配置已被其他管理员修改。最新设置：${current.source_name || '未绑定'}，${current.enabled ? '已启用' : '已关闭'}。你的修改已保留，请核对后重新保存。`)
          }
        } catch {
          setConflict('配置已被其他管理员修改，最新状态读取失败。请关闭后重新打开配置。')
        }
      }
    },
  })
  function submit() {
    const source = sources.find((item) => item.key === sourceKey)
    if (enabled && !source) { setError('启用服务前，请选择绑定存储源。'); return }
    if (enabled && source?.is_disabled) { setError('该存储源已禁用，请启用存储源或选择其他源。'); return }
    setError(''); setConflict(''); mutation.mutate()
  }
  return (
    <DialogWrap open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose() }} title={`配置：${service.name}`} description={service.bindingHint}
      footer={<><Button variant="ghost" disabled={mutation.isPending} onClick={onClose}>取消</Button><Button disabled={mutation.isPending || (enabled && !sourceKey)} onClick={submit}>{mutation.isPending ? '保存中…' : '保存服务设置'}</Button></>}
    >
      <Field label="服务开关">
        <label className={fieldCss.checkboxRow}>
          <input type="checkbox" aria-label="启用服务" className={fieldCss.checkbox} checked={enabled} disabled={mutation.isPending} onChange={(event) => setEnabled(event.target.checked)} />启用服务
        </label>
      </Field>
      <Field label="绑定存储源" hint="选择“未绑定”并关闭服务，即可解除当前绑定。">
        <Select ariaLabel="绑定存储源" value={sourceKey} disabled={mutation.isPending} onValueChange={setSourceKey}
          options={[{ value: '', label: '未绑定' }, ...sources.map((source) => ({ value: source.key, label: `${source.name}${source.is_disabled ? '（已禁用）' : ''}`, disabled: source.is_disabled }))]} />
      </Field>
      {sourceKey ? <p className={siteCss.path}>{sources.find((source) => source.key === sourceKey)?.root_path}</p> : null}
      {conflict ? <div role="alert" className={siteCss.error}>{conflict}</div> : error ? <div role="alert" className={siteCss.error}>{error}</div> : null}
    </DialogWrap>
  )
}

function ImageBedOptions({ usable }: { usable: boolean }) {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ['admin-anon-settings'], queryFn: adminGetAnonymousSettings, retry: false })
  const retention = useQuery({ queryKey: ['admin-image-bed-retention'], queryFn: adminGetImageBedRetention, retry: false })
  const status = useQuery({ queryKey: ['anon-status'], queryFn: fetchAnonymousStatus, retry: false })
  const [retentionOpen, setRetentionOpen] = useState(false)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => adminSetAnonymousSettings({ enabled }),
    onMutate: (enabled) => {
      setError('')
      const previous = settings.data
      if (previous) queryClient.setQueryData(['admin-anon-settings'], { ...previous, enabled })
      return previous
    },
    onError: (e, _, previous) => {
      if (previous) queryClient.setQueryData(['admin-anon-settings'], previous)
      setError(e instanceof Error ? e.message : '匿名上传设置保存失败')
    },
    onSettled: async () => {
      await Promise.all(['admin-anon-settings', 'anon-status', 'system-status', 'admin-overview'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
    },
  })
  const days = (value: number) => value === 0 ? '不自动过期' : `${value} 天`
  return (
    <div className={siteCss.featureGroup}>
      {settings.data ? (
        <>
          <label className={fieldCss.checkboxRow}>
            <input type="checkbox" aria-label="允许匿名上传" className={fieldCss.checkbox} checked={settings.data.enabled}
              disabled={mutation.isPending || settings.isFetching || (!usable && !settings.data.enabled)} onChange={(event) => mutation.mutate(event.target.checked)} />允许匿名上传
          </label>
          <p className={siteCss.hint}>{!usable ? '图床服务或绑定源当前不可用，匿名入口暂不可用。'
            : settings.data.enabled ? `任何人都可通过 /upload 上传图片${status.data ? `，单张最大 ${status.data.max_file_size_mb} MB` : ''}。`
              : '匿名上传已关闭，登录用户仍可使用图床。'}{mutation.isPending ? ' 正在保存…' : ''}</p>
        </>
      ) : settings.isError ? <div role="alert" className={siteCss.error}>匿名设置读取失败：{settings.error.message} <Button variant="ghost" onClick={() => void settings.refetch()}>重试</Button></div>
        : <span className={siteCss.hint}>正在加载匿名上传设置…</span>}
      {error ? <div role="alert" className={siteCss.error}>{error}</div> : null}
      <div className={siteCss.featureRow}>
        <p className={siteCss.hint}>{retention.data ? `图片保留：登录用户${days(retention.data.user_retention_days)} · 匿名上传${days(retention.data.anonymous_retention_days)}` : '图片保留策略尚未加载。'}</p>
        <Button variant="secondary" disabled={!retention.data || retention.isFetching} onClick={() => setRetentionOpen(true)}>保留策略</Button>
      </div>
      {retention.isError ? <div role="alert" className={siteCss.error}>保留策略读取失败：{retention.error.message} <Button variant="ghost" onClick={() => void retention.refetch()}>重试</Button></div> : null}
      {retentionOpen && retention.data ? <ImageRetentionDialog retention={retention.data} onClose={() => setRetentionOpen(false)} /> : null}
    </div>
  )
}

function ImageRetentionDialog({ retention, onClose }: { retention: ImageBedRetention; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [userDays, setUserDays] = useState(String(retention.user_retention_days))
  const [anonymousDays, setAnonymousDays] = useState(String(retention.anonymous_retention_days))
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => adminSetImageBedRetention({ user_retention_days: Number(userDays), anonymous_retention_days: Number(anonymousDays) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin-image-bed-retention'] }); onClose() },
    onError: (e) => setError(e instanceof Error ? e.message : '保留策略保存失败'),
  })
  function submit() {
    if ([userDays, anonymousDays].some((value) => value.trim() === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
      setError('保留天数必须是非负整数。'); return
    }
    setError(''); mutation.mutate()
  }
  return (
    <DialogWrap open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose() }} title="图片保留策略" description="0 表示不自动过期；到期后图片直链与缩略图停止提供，历史记录保留供清理。"
      footer={<><Button variant="ghost" disabled={mutation.isPending} onClick={onClose}>取消</Button><Button disabled={mutation.isPending} onClick={submit}>{mutation.isPending ? '保存中…' : '保存保留策略'}</Button></>}
    >
      <div className={fieldCss.grid2}>
        <Field label="登录用户图片保留天数"><Input type="number" min="0" step="1" aria-label="登录用户图片保留天数" value={userDays} disabled={mutation.isPending} onChange={(event) => setUserDays(event.target.value)} /></Field>
        <Field label="匿名图片保留天数"><Input type="number" min="0" step="1" aria-label="匿名图片保留天数" value={anonymousDays} disabled={mutation.isPending} onChange={(event) => setAnonymousDays(event.target.value)} /></Field>
      </div>
      {error ? <div role="alert" className={siteCss.error}>{error}</div> : null}
    </DialogWrap>
  )
}

function SiteRuntimeSection() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => apiFetch<{ version: string }>('/api/v1/health') })
  const system = useQuery({ queryKey: ['system-status'], queryFn: fetchSystemStatus, retry: false })
  return (
    <section className={css.section}>
      <div className={css.sectionHeader}><h3 className={css.sectionTitle}>运行信息</h3></div>
      <div className={css.sectionBody}>
        <dl className={siteCss.facts}>
          <div><dt>运行版本</dt><dd>{health.data?.version ?? '—'}</dd></div>
          <div><dt>对外地址</dt><dd>{system.data?.public_url || '—'}</dd></div>
        </dl>
        {system.isError ? <div role="alert" className={siteCss.error}>运行信息读取失败：{system.error.message} <Button variant="ghost" onClick={() => void system.refetch()}>重试</Button></div> : null}
        <p className={siteCss.hint}>监听地址、对外地址和上传限制由 config.yaml 与 OMNISTORE_* 环境变量管理，修改后需重启服务。</p>
      </div>
    </section>
  )
}
function BackupSection() {
  const [message, setMessage] = useState('')
  const exportMutation = useMutation({
    mutationFn: adminExportSystemConfig,
    onSuccess: (filename) => setMessage(`已生成并下载 ${filename}`),
    onError: (error) => setMessage(error instanceof ApiRequestError ? error.message : '导出失败，请稍后重试'),
  })

  return (
    <section className={css.section}>
      <div className={css.sectionHeader}>
        <h3 className={css.sectionTitle}>导出系统配置包</h3>
        <p className={css.sectionHint}>生成当前实例的可迁移配置快照，用于人工备份或故障恢复。</p>
      </div>
      <div className={css.sectionBody}>
        <div className={css.exportSummary}>
          <span className={css.exportIcon}><IconDownload size={22} /></span>
          <div className={css.exportCopy}>
            <strong>数据库、配置与密钥材料</strong>
            <span className={css.exportCopySecondary}>包含 SQLite 一致性快照、生效配置、恢复说明，以及 keys 目录中的普通文件。</span>
          </div>
          <div className={css.exportAction}>
            <Button
              onClick={() => {
                setMessage('')
                exportMutation.mutate()
              }}
              disabled={exportMutation.isPending}
            >
              <IconDownload size={16} />
              {exportMutation.isPending ? '正在生成…' : '导出配置包'}
            </Button>
          </div>
        </div>
        <div className={css.exportNotice} role="note">
          <strong>配置包包含敏感系统数据，请按备份凭据保管。</strong>
          <span className={css.exportCopySecondary}>不会包含存储源中的真实文件、缓存、上传临时文件或日志；这些内容需要单独备份。</span>
        </div>
        {message ? (
          <p className={exportMutation.isError ? css.exportMessageError : css.exportMessage} role="status">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  )
}


function BrandingSection() {
  const queryClient = useQueryClient()
  const branding = useQuery({ queryKey: ['admin-branding'], queryFn: adminGetBranding, retry: false })
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState('')

  const save = useMutation({
    mutationFn: () => adminSetBranding(name),
    onSuccess: async () => {
      setEditing(false)
      setMsg('')
      await queryClient.invalidateQueries({ queryKey: ['admin-branding'] })
      await queryClient.invalidateQueries({ queryKey: ['system-status'] })
    },
    onError: (error) => {
      setMsg(error instanceof ApiRequestError ? error.message : '保存失败，请重试。')
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (name.trim().length > 64) {
      setMsg('实例名称不能超过 64 个字符。')
      return
    }
    save.mutate()
  }

  const currentName = branding.data?.instance_name ?? 'OmniStore'

  return (
    <section className={css.section}>
      <header className={css.sectionHeaderWithAction}>
        <div className={css.sectionHeaderCopy}>
          <h3 id="branding-title" className={css.sectionTitle}>品牌信息</h3>
          <p className={css.sectionHint}>
            实例名称显示在公开页与分享页顶部及页脚；清空保存可恢复默认名称 OmniStore。
          </p>
        </div>
        <div className={css.sectionHeaderAction}>
          <Button
            variant="secondary" disabled={!branding.data || save.isPending}
            onClick={() => {
              setName(currentName)
              setEditing((open) => !open)
              setMsg('')
            }}
          >
            {editing ? '取消' : '修改名称'}
          </Button>
        </div>
      </header>
      <div className={css.sectionBody}>
        {editing ? (
          <form onSubmit={submit} style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
            <Field label="实例名称" required error={msg} hint="1-64 个字符，展示于公开侧页面。">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="OmniStore" autoFocus />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? '保存中…' : '保存'}</Button>
            </div>
          </form>
        ) : (
          branding.isError ? <div role="alert" className={siteCss.error}>品牌信息读取失败：{branding.error.message} <Button variant="ghost" onClick={() => void branding.refetch()}>重试</Button></div> : <div className={css.kvRow}>
            <span className={css.kvLabel}>实例名称</span>
            <span className={css.kvValue}>{branding.isPending ? '加载中…' : currentName}</span>
          </div>
        )}
      </div>
    </section>
  )
}
