import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import {
  browsePublicShare,
  fetchPublicShare,
  publicShareArchiveUrl,
  publicShareRawUrl,
  unlockPublicShare,
  type PublicShareInfo,
} from '../api/shares'
import { PublicShell } from '../components/layout/PublicShell'
import { FileTable } from '../components/files/FileTable'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { PreviewModal } from '../preview/PreviewModal'
import { PreviewContent, type PreviewItem } from '../preview/PreviewContent'
import { resolvePreview } from '../preview/resolver'
import { IconDownload, IconFile, IconFolder, IconGrid, IconImage, IconKey, IconLink, IconList } from '../components/ui/Icon'
import { formatDate } from '../utils/format'
import * as ft from '../components/files/FileTable.css'
import * as css from './PublicShare.css'

export function PublicSharePage() {
  const { shareKey } = useParams({ from: '/s/$shareKey' })
  const search = useSearch({ from: '/s/$shareKey' })
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const info = useQuery({ queryKey: ['public-share', shareKey], queryFn: () => fetchPublicShare(shareKey), retry: false })

  const unlock = useMutation({
    mutationFn: () => unlockPublicShare(shareKey, password),
    onSuccess: async () => {
      setPasswordError('')
      await queryClient.invalidateQueries({ queryKey: ['public-share', shareKey] })
    },
    onError: (error) => setPasswordError(error instanceof ApiRequestError ? error.message : '验证失败，请重试。'),
  })

  if (info.isPending) return <PublicShell><div className={css.empty}>正在加载分享…</div></PublicShell>

  // 1.2.0：过期 / 次数用完不再伪装成 404，访客能看到明确状态（docs/design/share-preview-system.md）。
  if (info.isError || !info.data) {
    const code = info.error instanceof ApiRequestError ? info.error.code : ''
    if (code === 'SHARE_EXPIRED') {
      return <ShareStatus title="分享已过期" hint="该分享已超过有效期，无法继续访问。请联系分享者重新分享。" />
    }
    if (code === 'SHARE_EXHAUSTED') {
      return <ShareStatus title="下载次数已用完" hint="该分享的下载次数已达上限，无法继续访问。请联系分享者重新分享。" />
    }
    return (
      <ShareStatus
        title="分享不存在或已失效"
        hint="链接可能已被撤销或不存在。请向分享者确认链接是否正确。"
      />
    )
  }

  if (info.data.protected && !info.data.access_granted) {
    return (
      <PublicShell>
        <div className={css.unlockWrap}>
          <section className={css.unlockCard}>
            <span className={css.unlockIcon}><IconKey size={28} /></span>
            <h1>此分享受密码保护</h1>
            <p>输入分享者提供的访问密码以查看「{info.data.name}」。</p>
            <form className={css.unlockForm} onSubmit={(event) => { event.preventDefault(); setPasswordError(''); unlock.mutate() }}>
              <Input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="访问密码" aria-label="访问密码" />
              {passwordError ? <span className={css.error} role="alert">{passwordError}</span> : null}
              <Button type="submit" disabled={unlock.isPending || !password}>{unlock.isPending ? '验证中…' : '查看分享'}</Button>
            </form>
          </section>
        </div>
      </PublicShell>
    )
  }

  return info.data.type === 'file'
    ? <PublicFile shareKey={shareKey} info={info.data} />
    : <PublicDirectory shareKey={shareKey} info={info.data} path={search.path} page={search.page} />
}

function ShareStatus({ title, hint }: { title: string; hint: string }) {
  return (
    <PublicShell>
      <div className={css.empty}>
        <span className={css.unlockIcon}><IconLink size={28} /></span>
        <h1>{title}</h1>
        <p>{hint}</p>
      </div>
    </PublicShell>
  )
}

// —— 文件分享：按统一预览类型内嵌展示（图片/PDF/文本/音视频），不支持则仅下载 ——
function PublicFile({ shareKey, info }: { shareKey: string; info: PublicShareInfo }) {
  const item: PreviewItem = {
    name: info.name,
    size: info.size ?? null,
    url: publicShareRawUrl(shareKey, ''),
    downloadUrl: publicShareRawUrl(shareKey, '', true),
  }
  const previewable = resolvePreview({ name: info.name, size: info.size }) !== 'unsupported'
  return (
    <PublicShell>
      <ShareHero info={info}>
        <a className={css.linkButton} href={publicShareRawUrl(shareKey, '', true)}><IconDownload size={16} /> 下载文件</a>
      </ShareHero>
      {previewable ? (
        <div className={css.embedPreview}>
          <PreviewContent item={item} />
        </div>
      ) : null}
    </PublicShell>
  )
}

// —— 目录分享：列表 / 画廊两种视图 + 目录流式 ZIP 打包下载 ——
function PublicDirectory({ shareKey, info, path, page }: { shareKey: string; info: PublicShareInfo; path: string; page: number }) {
  const navigateRoute = useNavigate()
  const [view, setView] = useState<'list' | 'gallery'>('list')
  const [previewState, setPreviewState] = useState<{ items: PreviewItem[]; index: number } | null>(null)
  const browse = useQuery({
    queryKey: ['public-share-browse', shareKey, path, page],
    queryFn: () => browsePublicShare(shareKey, path, page),
    retry: false,
  })
  const segments = useMemo(() => path.split('/').filter(Boolean), [path])
  const entries = browse.data?.items ?? []
  const galleryImages = useMemo(
    () => entries.filter((entry) => entry.type === 'file' && resolvePreview({ name: entry.name, size: entry.size }) === 'image'),
    [entries],
  )
  const remaining = info.max_downloads > 0 ? Math.max(0, info.max_downloads - info.download_count) : null

  // 切换目录时回到列表视图，画廊只对含图片的目录开放。
  useEffect(() => { setView('list') }, [path])

  function navigate(nextPath: string, nextPage = 1) {
    void navigateRoute({
      to: '/s/$shareKey',
      params: { shareKey },
      search: { path: nextPath, page: nextPage },
    })
  }

  function childPath(name: string) {
    return [...segments, name].join('/')
  }

  function previewItemFor(entry: { name: string; size: number }): PreviewItem {
    return {
      name: entry.name,
      size: entry.size,
      url: publicShareRawUrl(shareKey, childPath(entry.name)),
      downloadUrl: publicShareRawUrl(shareKey, childPath(entry.name), true),
    }
  }

  function openPreview(entry: { name: string; size: number }) {
    const files = entries.filter((entry) => entry.type === 'file')
    const items = files.map(previewItemFor)
    const index = Math.max(0, items.findIndex((item) => item.name === entry.name))
    setPreviewState({ items, index })
  }

  function openOrDownload(entry: { name: string; size: number }) {
    if (resolvePreview({ name: entry.name, size: entry.size }) !== 'unsupported') {
      openPreview(entry)
      return
    }
    const link = document.createElement('a')
    link.href = publicShareRawUrl(shareKey, childPath(entry.name), true)
    link.click()
  }

  const zipHint = remaining !== null
    ? `打包下载当前目录将消耗 1 次下载次数（剩余 ${remaining} 次）`
    : '打包下载当前目录'

  return (
    <PublicShell>
      <ShareHero info={info} />
      <div className={css.toolbar}>
        <nav className={css.crumbs} aria-label="分享目录位置">
          <button className={css.crumbButton} onClick={() => navigate('')}>{info.name}</button>
          {segments.map((segment, index) => {
            const current = index === segments.length - 1
            return <span key={`${segment}-${index}`}> / {current ? <span className={css.currentCrumb}>{segment}</span> : <button className={css.crumbButton} onClick={() => navigate(segments.slice(0, index + 1).join('/'))}>{segment}</button>}</span>
          })}
        </nav>
        <div className={css.toolbarActions}>
          {remaining === null || remaining > 0 ? (
            <a className={css.zipButton} href={publicShareArchiveUrl(shareKey, path)} title={zipHint} aria-label="打包下载当前目录 ZIP">
              <IconDownload size={15} /> 下载全部 (ZIP)
            </a>
          ) : null}
          <div className={css.viewToggle}>
            <button
              type="button"
              className={view === 'list' ? css.viewOptionActive : css.viewOption}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
            >
              <IconList size={14} /> 列表
            </button>
            <button
              type="button"
              className={view === 'gallery' ? css.viewOptionActive : css.viewOption}
              onClick={() => setView('gallery')}
              aria-pressed={view === 'gallery'}
              disabled={galleryImages.length === 0}
              title={galleryImages.length === 0 ? '当前目录没有图片' : undefined}
            >
              <IconGrid size={14} /> 画廊
            </button>
          </div>
        </div>
      </div>
      {view === 'gallery' && galleryImages.length > 0 ? (
        <div className={css.gallery}>
          {galleryImages.map((entry) => (
            <div className={css.galleryCell} key={entry.name}>
              <button
                type="button"
                className={css.galleryItem}
                onClick={() => openPreview(entry)}
                aria-label={`预览图片 ${entry.name}`}
              >
                <img
                  className={css.galleryImg}
                  src={publicShareRawUrl(shareKey, childPath(entry.name))}
                  alt={entry.name}
                  loading="lazy"
                />
              </button>
              <span className={css.galleryName}>{entry.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <FileTable
          entries={browse.isError ? [] : entries}
          loading={browse.isPending}
          showType
          emptyTitle={browse.isError ? '目录不可访问' : '目录为空'}
          emptyHint={browse.isError ? '分享可能已经失效。' : undefined}
          onOpenDir={(name) => navigate([...segments, name].join('/'))}
          onOpenFile={openOrDownload}
          fileHref={(entry) => publicShareRawUrl(shareKey, childPath(entry.name))}
          renderActions={(entry) => entry.type === 'file' ? (
            <span className={ft.actions}>
              <button className={ft.actionBtn} onClick={() => openOrDownload(entry)} title={resolvePreview({ name: entry.name, size: entry.size }) !== 'unsupported' ? '预览' : '下载'} aria-label={`${resolvePreview({ name: entry.name, size: entry.size }) !== 'unsupported' ? '预览' : '下载'} ${entry.name}`}>
                <IconImage size={16} />
              </button>
              <a className={ft.actionBtn} href={publicShareRawUrl(shareKey, childPath(entry.name), true)} title="下载" aria-label={`下载 ${entry.name}`}><IconDownload size={16} /></a>
            </span>
          ) : null}
        />
      )}
      {view === 'gallery' && galleryImages.length > 0 ? <span className={css.galleryCount}>共 {galleryImages.length} 张图片</span> : null}
      {browse.data && (browse.data.has_next || page > 1) ? (
        <div className={css.pager}>
          <span>共 {browse.data.total} 项</span>
          <Button variant="secondary" disabled={page <= 1} onClick={() => navigate(path, page - 1)}>上一页</Button>
          <Button variant="secondary" disabled={!browse.data.has_next} onClick={() => navigate(path, page + 1)}>下一页</Button>
        </div>
      ) : null}
      {previewState ? (
        <PreviewModal
          items={previewState.items}
          index={previewState.index}
          onIndexChange={(next) => setPreviewState((current) => (current ? { ...current, index: next } : current))}
          onClose={() => setPreviewState(null)}
        />
      ) : null}
    </PublicShell>
  )
}

function ShareHero({ info, children }: { info: PublicShareInfo; children?: React.ReactNode }) {
  const remaining = info.max_downloads > 0 ? Math.max(0, info.max_downloads - info.download_count) : null
  return (
    <header className={css.hero}>
      <div className={css.identity}>
        <span className={css.icon}>{info.type === 'dir' ? <IconFolder size={27} /> : <IconFile size={27} />}</span>
        <div style={{ minWidth: 0 }}>
          <h1 className={css.title}>{info.name}</h1>
          <div className={css.meta}>
            <span>{info.type === 'dir' ? '共享文件夹' : '共享文件'}</span>
            <span>{info.expires_at ? `有效至 ${formatDate(info.expires_at)}` : '长期有效'}</span>
            {remaining !== null ? <span>剩余 {remaining} / {info.max_downloads} 次下载</span> : null}
            {info.size != null && info.type === 'file' ? <span>{formatShareSize(info.size)}</span> : null}
          </div>
        </div>
      </div>
      {children ? <div className={css.actions}>{children}</div> : null}
    </header>
  )
}

function formatShareSize(size: number): string {
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}
