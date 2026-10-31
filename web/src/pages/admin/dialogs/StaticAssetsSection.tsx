const staticCacheModeLabels: Record<string, string> = {
  short: '短缓存（默认，5 分钟）',
  'no-cache': '协商缓存（使用前验证）',
  long: '长缓存（内容变化必须换 URL，需确认）',
}

const staticCorsModeLabels: Record<string, string> = {
  public: '公开跨域（ACAO: *，无凭据）',
  allowlist: '白名单（精确匹配 Origin）',
  none: '不添加 CORS 头',
}


import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '../../../api/client'
import { adminListSources, adminConfigureStaticAssets, adminGetStaticConfig, adminRemoveStaticConfig, adminPreflightStaticAssets, adminRebindStaticAssets, adminUpdateStaticAssets, type StaticAssetConfig, type StaticAssetPreflight, type AdminSource } from '../../../api/admin'
import { Checkbox, Input, Textarea } from '@fluentui/react-components'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { DialogWrap } from '../../../components/ui/Dialog'
import { Banner } from '../../../components/shell/Banner'
import { FormField } from '../../../components/shell/FormLayout'
import { Select } from '../../../components/ui/Select'
import { useStyles } from '../sections/sources.styles'

export function StaticAssetsSection({ sourceKey }: { sourceKey: string }) {
  const css = useStyles()
  const config = useQuery({ queryKey: ['static-assets-config', sourceKey], queryFn: () => adminGetStaticConfig(sourceKey) })
  if (config.isPending) {
    return (
      <section className={css.staticProtocolSection}>
        <div className={css.staticProtocolBody}><span className={css.kvLabel}>加载中…</span></div>
      </section>
    )
  }
  if (config.isError) return <Banner intent="error">{config.error.message}</Banner>
  const data = config.data
  if (!data?.public_asset_id) {
    return <StaticAssetsConfigureForm sourceKey={sourceKey} />
  }
  return <StaticAssetsConfiguredView key={`${sourceKey}:${data.revision}`} config={data} />
}

function StaticAssetsConfigureForm({ sourceKey }: { sourceKey: string }) {
  const css = useStyles()
  const queryClient = useQueryClient()
  const [publishRoot, setPublishRoot] = useState('blog-assets')
  const [confirmRoot, setConfirmRoot] = useState(false)
  const [preflight, setPreflight] = useState<StaticAssetPreflight | null>(null)
  const [err, setErr] = useState('')

  const preflightMut = useMutation({
    mutationFn: () => adminPreflightStaticAssets(sourceKey, { publish_root: publishRoot.trim() }),
    onSuccess: (result) => { setPreflight(result); setErr('') },
    onError: (e) => { setErr(e instanceof ApiRequestError ? e.message : '预检失败'); setPreflight(null) },
  })
  const configureMut = useMutation({
    mutationFn: () => adminConfigureStaticAssets(sourceKey, {
      publish_root: publishRoot.trim(),
      confirm_publish_root: confirmRoot,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['static-assets-config', sourceKey] }),
        queryClient.invalidateQueries({ queryKey: ['admin-sources'] }),
      ])
    },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '配置失败'),
  })

  return (
    <section className={css.staticProtocolSection}>
      <header className={css.staticProtocolHeader}>
        <div className={css.sectionHeaderCopy}>
          <h3 className={css.sectionTitle}>发布范围</h3>
          <p className={css.sectionHint}>
            不提供目录列表不等于保密；发布目录内的受支持文件将对任何访客公开读取。
          </p>
        </div>
      </header>
      <div className={css.staticProtocolBody}>
        <FormField
          label="发布目录（源内相对路径）"
          hint={publishRoot.trim() === '' ? '留空表示发布整个存储源根目录，必须显式确认。' : '例如 blog-assets；托管命名空间与排除规则永远不公开。'}
        >
          <Input
            value={publishRoot}
            onChange={(event) => { setPublishRoot(event.target.value); setErr(''); setPreflight(null); setConfirmRoot(false) }}
            placeholder="blog-assets"
            aria-label="静态资源发布目录"
          />
        </FormField>
        {publishRoot.trim() === '' && (
          <Checkbox
            label="我确认公开此存储源根目录内的受支持媒体文件"
            checked={confirmRoot}
            onChange={(_, data) => setConfirmRoot(!!data.checked)}
          />
        )}
        <div className={css.staticProtocolActions}>
          <Button variant="secondary" disabled={!sourceKey || preflightMut.isPending} onClick={() => preflightMut.mutate()}>
            {preflightMut.isPending ? '预检中…' : '预检发布目录'}
          </Button>
          <Button disabled={!preflight?.root_exists || preflight.publish_root !== publishRoot.trim() || configureMut.isPending || (publishRoot.trim() === '' && !confirmRoot)} onClick={() => configureMut.mutate()}>
            {configureMut.isPending ? '保存中…' : '创建发布空间'}
          </Button>
        </div>
        {preflight && preflight.publish_root === publishRoot.trim() && (
          <div className={css.sourcePreview}>
            <p>样例条目：{preflight.sample_entries.length > 0 ? preflight.sample_entries.join('、') : '（目录为空）'}</p>
            <p>公开类型：{preflight.supported_types.join('、')}</p>
            {preflight.warnings.map((warning) => <p key={warning}>⚠ {warning}</p>)}
          </div>
        )}
        {err && <Banner intent="error">{err}</Banner>}
      </div>
    </section>
  )
}

function StaticAssetsConfiguredView({ config }: { config: StaticAssetConfig }) {
  const css = useStyles()
  const queryClient = useQueryClient()
  const sources = useQuery({ queryKey: ['admin-sources'], queryFn: adminListSources })
  const sourceKey = config.source_key
  const [enabled, setEnabled] = useState(config.enabled)
  const [cacheMode, setCacheMode] = useState(config.cache_mode)
  const [corsMode, setCorsMode] = useState(config.cors_mode)
  const [publicOrigin, setPublicOrigin] = useState(config.public_origin)
  const [allowedOrigins, setAllowedOrigins] = useState(config.allowed_origins.join('\n'))
  const [rebindOpen, setRebindOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const saveMut = useMutation({
    mutationFn: () => adminUpdateStaticAssets(sourceKey, {
      enabled,
      cache_mode: cacheMode,
      cors_mode: corsMode,
      public_origin: publicOrigin.trim(),
      allowed_origins: allowedOrigins.split('\n').map((origin) => origin.trim()).filter(Boolean),
      expected_revision: config.revision,
    }),
    onSuccess: async () => {
      setMsg('配置已保存。')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['static-assets-config'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-sources'] }),
      ])
    },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '保存失败'),
  })

  const removeMut = useMutation({
    mutationFn: () => adminRemoveStaticConfig(sourceKey, config.revision),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['static-assets-config', sourceKey] }),
        queryClient.invalidateQueries({ queryKey: ['admin-sources'] }),
      ])
    },
    onError: (error) => setErr(error instanceof ApiRequestError ? error.message : '移除失败'),
  })

  async function copyBaseURL() {
    await navigator.clipboard.writeText(config.base_url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <section className={css.staticProtocolSection}>
        <header className={css.staticProtocolHeader}>
          <div className={css.sectionHeaderCopy}>
            <h3 className={css.sectionTitle}>发布空间</h3>
            <p className={css.sectionHint}>
              发布目录：{config.publish_root || '（存储源根目录）'}
            </p>
          </div>
          <div className={css.sectionHeaderAction}>
            <Button variant="secondary" onClick={() => setRebindOpen(true)}>更换发布空间</Button>
          </div>
        </header>
        <div className={css.staticProtocolBody}>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>状态</span>
            <span className={css.kvValue}>
              {config.source_disabled
                ? <Badge color="gray">源已禁用（原站 404）</Badge>
                : config.enabled ? <Badge color="green">公开读取中</Badge> : <Badge color="gray">已关闭（原站 404）</Badge>}
            </span>
          </div>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>baseUrl</span>
            <div className={css.kvValue} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              <span>{config.base_url}</span>
              <Button variant="ghost" onClick={() => void copyBaseURL()}>{copied ? '已复制' : '复制'}</Button>
            </div>
          </div>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>公开类型</span>
            <span className={css.kvValue}>JPEG · PNG · GIF · WebP · MP4 · WebM（扩展名与服务端签名同时校验）</span>
          </div>
        </div>
      </section>

      <section className={css.staticProtocolSettings}>
        <div className={css.staticProtocolHeader}>
          <h3 className={css.sectionTitle}>缓存与跨域</h3>
        </div>
        <div className={css.staticProtocolBody}>
          <FormField hint="关闭后原站公开读取返回 404；无法收回已分发到浏览器/CDN 的缓存。">
            <Checkbox label="提供公开读取" checked={enabled} onChange={(_, data) => setEnabled(!!data.checked)} />
          </FormField>
          <FormField label="缓存档位" hint="long 仅适合内容修改就更换 URL 的资源。">
            <Select
              value={cacheMode}
              onValueChange={(value) => setCacheMode(value as StaticAssetConfig['cache_mode'])}
              options={Object.entries(staticCacheModeLabels).map(([value, label]) => ({ value, label }))}
              ariaLabel="缓存档位"
            />
          </FormField>
          <FormField label="跨域档位" hint="CORS 不是图片保密机制；公开媒体可跨站嵌入。">
            <Select
              value={corsMode}
              onValueChange={(value) => setCorsMode(value as StaticAssetConfig['cors_mode'])}
              options={Object.entries(staticCorsModeLabels).map(([value, label]) => ({ value, label }))}
              ariaLabel="跨域档位"
            />
          </FormField>
          <FormField label="对外 origin（可选）" hint="只改变输出的 baseUrl；不自动配置 DNS/TLS/反向代理。">
            <Input
              value={publicOrigin}
              onChange={(event) => setPublicOrigin(event.target.value)}
              placeholder="https://files.example.com"
              aria-label="静态资源对外 origin"
            />
          </FormField>
          {corsMode === 'allowlist' && (
            <FormField label="允许的 Origin 白名单（每行一个完整 origin）" hint="精确匹配，不支持任意后缀。">
              <Textarea aria-label="静态 HTTP Origin 白名单" className={css.formTextarea} rows={4} resize="vertical" value={allowedOrigins} onChange={(event) => setAllowedOrigins(event.target.value)} />
            </FormField>
          )}
          <Button disabled={saveMut.isPending} onClick={() => { setMsg(''); setErr(''); saveMut.mutate() }}>
            {saveMut.isPending ? '保存中…' : '保存静态 HTTP'}
          </Button>
          {!config.enabled && <Button variant="dangerGhost" disabled={removeMut.isPending} onClick={() => {
            if (window.confirm('撤销此源的静态公开地址？已有 URL 将失效，磁盘文件会保留。')) removeMut.mutate()
          }}>移除静态访问配置</Button>}
          {msg && <Banner intent="success">{msg}</Banner>}
          {err && <Banner intent="error">{err}</Banner>}
        </div>
      </section>

      <StaticAssetsRebindDialog
        open={rebindOpen}
        onOpenChange={setRebindOpen}
        config={config}
        sources={sources.data ?? []}
      />
    </>
  )
}

function StaticAssetsRebindDialog({
  open,
  onOpenChange,
  config,
  sources,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  config: StaticAssetConfig
  sources: AdminSource[]
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'reset' | 'relocate'>('reset')
  const [sourceKey, setSourceKey] = useState(config.source_key)
  const [publishRoot, setPublishRoot] = useState(config.publish_root)
  const [confirmRelocate, setConfirmRelocate] = useState(false)
  const [confirmRoot, setConfirmRoot] = useState(false)
  const [err, setErr] = useState('')

  const usable = sources.filter((source) => !source.is_disabled)
  const mutation = useMutation({
    mutationFn: () => adminRebindStaticAssets(config.source_key, {
      source_key: sourceKey,
      publish_root: publishRoot.trim(),
      mode,
      confirm_publish_root: confirmRoot,
      confirm_relocate: mode === 'relocate' ? confirmRelocate : undefined,
      expected_revision: config.revision,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['static-assets-config'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-sources'] }),
      ])
      onOpenChange(false)
    },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '重绑失败'),
  })

  useEffect(() => {
    if (open) {
      setMode('reset')
      setSourceKey(config.source_key)
      setPublishRoot(config.publish_root)
      setConfirmRelocate(false)
      setConfirmRoot(false)
      setErr('')
    }
  }, [open, config.source_key, config.publish_root])

  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title="更换发布空间"
      description="更换 source 或发布目录属于公开身份变更；普通保存无法完成此操作。"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={mutation.isPending || (mode === 'relocate' && !confirmRelocate) || (publishRoot.trim() === '' && !confirmRoot)} onClick={() => mutation.mutate()}>
            {mutation.isPending ? '执行中…' : '确认重绑'}
          </Button>
        </>
      }
    >
      <FormField label="重绑模式">
        <Select
          value={mode}
          onValueChange={(value) => setMode(value as 'reset' | 'relocate')}
          options={[
            { value: 'reset', label: '重置：生成全新公开标识，旧 baseUrl 原站 404' },
            { value: 'relocate', label: '迁移保留：同一批内容迁移磁盘后保留标识' },
          ]}
          ariaLabel="重绑模式"
        />
      </FormField>
      <FormField label="新发布存储源">
        <Select
          value={usable.some((source) => source.key === sourceKey)
            ? String(usable.findIndex((source) => source.key === sourceKey))
            : ''}
          onValueChange={(index) => { setSourceKey(usable[Number(index)]?.key ?? ''); setConfirmRoot(false) }}
          options={usable.map((source, index) => ({ value: String(index), label: source.name }))}
          ariaLabel="重绑目标存储源"
        />
      </FormField>
      <FormField label="新发布目录" hint="留空表示存储源根目录（需在下一步确认）。">
        <Input value={publishRoot} onChange={(event) => { setPublishRoot(event.target.value); setConfirmRoot(false) }} aria-label="重绑目标发布目录" />
      </FormField>
      {publishRoot.trim() === '' && (
        <Checkbox
          label="我确认公开目标存储源根目录内的受支持媒体文件"
          checked={confirmRoot}
          onChange={(_, data) => setConfirmRoot(!!data.checked)}
        />
      )}
      {mode === 'relocate' && (
        <FormField hint="勾选表示你已确认同一批内容已迁移/复制到新位置并核验，旧相对路径将继续有效。">
          <Checkbox
            label="我确认同一批内容已就位并核验，愿意承担核验责任（写入审计）"
            checked={confirmRelocate}
            onChange={(_, data) => setConfirmRelocate(!!data.checked)}
          />
        </FormField>
      )}
      {err && <Banner intent="error">{err}</Banner>}
    </DialogWrap>
  )
}
