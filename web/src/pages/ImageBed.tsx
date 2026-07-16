import { useMemo, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteImage,
  fetchImageBedTargets,
  fetchImageHistory,
  fetchTokenStatus,
  setDefaultImageBedTarget,
  uploadImage,
} from '../api/imagebed'
import type { ImageRecord } from '../api/imagebed'
import { ApiRequestError } from '../api/client'
import { fetchMe } from '../api/auth'
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import {
  IconChevronDown,
  IconChevronRight,
  IconCloud,
  IconCopy,
  IconExternalLink,
  IconGrid,
  IconImage,
  IconInfo,
  IconLink,
  IconList,
  IconRefresh,
  IconSettings,
  IconTrash,
} from '../components/ui/Icon'
import { formatBytes } from '../utils/format'
import { resolveImageBedTarget } from './imageBedTarget'
import * as css from './ImageBed.css'

type TargetData = Awaited<ReturnType<typeof fetchImageBedTargets>>
type TimeFilter = 'all' | 'today' | 'month'
type ViewMode = 'grid' | 'list'

export function ImageBedPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const targets = useQuery({ queryKey: ['imagebed-targets'], queryFn: fetchImageBedTargets })
  const isAdmin = me.data?.role === 'super_admin'

  if (targets.isPending) {
    return (
      <AppShell title="图床" wide>
        <div className={css.loadingState} aria-busy="true">正在加载图床…</div>
      </AppShell>
    )
  }

  if (targets.isSuccess && targets.data.targets.length === 0) {
    return (
      <AppShell title="图床" wide>
        <NoTargetView isAdmin={isAdmin} />
      </AppShell>
    )
  }

  if (!targets.data) return null

  return <ImageBedContent targetData={targets.data} />
}

function NoTargetView({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className={css.noTargetPage}>
      <div className={css.noTargetIcon}><IconCloud size={42} /></div>
      <h1 className={css.noTargetTitle}>
        {isAdmin ? '还没有可用的图床存储源' : '还没有可用的图床目标'}
      </h1>
      <p className={css.noTargetHint}>
        {isAdmin
          ? '创建存储源并启用图床功能后，即可在这里上传和管理图片。'
          : '请联系管理员分配一个具备读写权限且已启用图床的存储源。'}
      </p>
      {isAdmin ? (
        <Link to="/app/admin" search={{ section: 'sources' }} className={css.primaryLink}>
          前往系统设置 <IconChevronRight size={15} />
        </Link>
      ) : null}
    </div>
  )
}

function ImageBedContent({ targetData }: { targetData: TargetData }) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [selectedTarget, setSelectedTarget] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [page, setPage] = useState(1)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [copied, setCopied] = useState('')

  const history = useQuery({
    queryKey: ['imagebed-history', page],
    queryFn: () => fetchImageHistory(page),
  })
  const tokenStatus = useQuery({ queryKey: ['token-status'], queryFn: fetchTokenStatus })

  const currentTarget = resolveImageBedTarget(
    selectedTarget,
    targetData.default_source_id,
    targetData.targets,
  )
  const currentTargetData = targetData.targets.find((target) => target.source_id === currentTarget)
  const apiEndpoint = `${window.location.origin}/api/v1/image-bed/upload`

  const visibleImages = useMemo(
    () => filterImages(history.data?.items ?? [], timeFilter),
    [history.data?.items, timeFilter],
  )
  const stats = useMemo(() => buildStats(history.data?.items ?? []), [history.data?.items])

  const setDefaultMut = useMutation({
    mutationFn: setDefaultImageBedTarget,
    onSuccess: async () => {
      setNotice({ tone: 'success', text: '默认图床目标已更新' })
      await queryClient.invalidateQueries({ queryKey: ['imagebed-targets'] })
    },
    onError: (error) => setNotice({ tone: 'error', text: errorMessage(error, '设置默认目标失败') }),
  })

  const deleteMut = useMutation({
    mutationFn: deleteImage,
    onSuccess: async () => {
      setNotice({ tone: 'success', text: '图片已删除' })
      await queryClient.invalidateQueries({ queryKey: ['imagebed-history'] })
    },
    onError: (error) => setNotice({ tone: 'error', text: errorMessage(error, '删除失败') }),
  })

  async function onUpload(files: FileList | File[]) {
    const queuedFiles = Array.from(files)
    if (queuedFiles.length === 0 || !currentTarget) return
    setNotice(null)
    setUploading(true)
    try {
      for (const file of queuedFiles) await uploadImage(file, currentTarget)
      setNotice({ tone: 'success', text: `${queuedFiles.length} 张图片上传成功` })
      await queryClient.invalidateQueries({ queryKey: ['imagebed-history'] })
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error, '上传失败') })
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDragging(false)
    if (!uploading) void onUpload(event.dataTransfer.files)
  }

  async function copyText(value: string, key: string) {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(''), 1600)
  }

  return (
    <AppShell title="图床" wide>
      <div className={css.pageHeader}>
        <h1 className={css.pageTitle}>图床</h1>
        {notice ? (
          <div className={notice.tone === 'success' ? css.successNotice : css.errorNotice} role="status">
            {notice.text}
          </div>
        ) : null}
      </div>

      <div className={css.workspace}>
        <div className={css.mainColumn}>
          <div className={css.uploadRow}>
            <section className={css.panel} aria-labelledby="upload-title">
              <button
                type="button"
                className={dragging ? css.dropZoneActive : css.dropZone}
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
                }}
                onDrop={onDrop}
              >
                <span className={css.uploadIcon}><IconCloud size={46} /></span>
                <strong id="upload-title" className={css.uploadTitle}>
                  {uploading ? '正在上传图片…' : '拖拽图片到这里，或点击上传'}
                </strong>
                <span className={css.uploadHint}>支持 JPG、PNG、WEBP、GIF，单张不超过 10MB</span>
              </button>
              <input
                ref={fileInput}
                className={css.hiddenInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                disabled={uploading}
                onChange={(event) => void onUpload(event.target.files ?? [])}
              />
            </section>

            <section className={css.panel} aria-labelledby="target-title">
              <div className={css.panelHeading}>
                <h2 id="target-title" className={css.sectionTitle}>图床目标</h2>
                <span className={css.statusBadge}>正常</span>
              </div>

              <div className={css.targetSelectWrap}>
                <span className={css.targetIcon}><IconImage size={19} /></span>
                <select
                  className={css.targetSelect}
                  value={currentTarget}
                  onChange={(event) => setSelectedTarget(event.target.value)}
                  aria-label="选择图床目标"
                >
                  {targetData.targets.map((target) => (
                    <option key={target.source_id} value={target.source_id}>
                      {target.name}{target.source_id === targetData.default_source_id ? '（默认）' : ''}
                    </option>
                  ))}
                </select>
                <span className={css.selectChevron}><IconChevronDown size={14} /></span>
              </div>
              <div className={css.targetMetaRow}>
                <span>{currentTargetData?.description || `存储源 ID：${currentTarget}`}</span>
                {currentTarget !== targetData.default_source_id ? (
                  <button
                    type="button"
                    className={css.textButton}
                    disabled={setDefaultMut.isPending}
                    onClick={() => setDefaultMut.mutate(currentTarget)}
                  >
                    设为默认
                  </button>
                ) : <span className={css.defaultLabel}>默认目标</span>}
              </div>

              <div className={css.interfaceHeading}>
                <span>接口信息</span>
                <IconInfo size={14} />
              </div>
              <InfoRow
                label="PicGo API Token"
                value={tokenStatus.data?.image_bed.exists ? '已配置 · 明文仅在重置时显示' : '尚未配置'}
                action={
                  <Link to="/app/admin" search={{ section: 'profile' }} className={css.inlineLink}>
                    管理
                  </Link>
                }
              />
              <InfoRow
                label="API 接口地址"
                value={apiEndpoint}
                action={
                  <CopyButton copied={copied === 'api'} onClick={() => void copyText(apiEndpoint, 'api')} />
                }
              />
              <InfoRow
                label="Markdown 示例"
                value="![图片](https://your-domain/i/xxx.jpg)"
                action={
                  <CopyButton
                    copied={copied === 'markdown-example'}
                    onClick={() => void copyText('![图片](https://your-domain/i/xxx.jpg)', 'markdown-example')}
                  />
                }
              />
            </section>
          </div>

          <section className={css.historySection} aria-labelledby="history-title">
            <div className={css.historyHeader}>
              <div className={css.historyTitleWrap}>
                <h2 id="history-title" className={css.historyTitle}>图片历史</h2>
                <button
                  type="button"
                  className={css.iconButton}
                  aria-label="刷新图片历史"
                  onClick={() => void history.refetch()}
                >
                  <IconRefresh size={15} />
                </button>
                <span className={css.historyCount}>{history.data?.total ?? 0} 张</span>
              </div>
              <div className={css.historyTools}>
                <select
                  className={css.filterSelect}
                  value={timeFilter}
                  onChange={(event) => setTimeFilter(event.target.value as TimeFilter)}
                  aria-label="按时间筛选"
                >
                  <option value="all">全部时间</option>
                  <option value="today">今天</option>
                  <option value="month">本月</option>
                </select>
                <div className={css.viewSwitch} aria-label="显示方式">
                  <button
                    type="button"
                    className={viewMode === 'grid' ? css.viewButtonActive : css.viewButton}
                    aria-label="网格视图"
                    onClick={() => setViewMode('grid')}
                  ><IconGrid size={16} /></button>
                  <button
                    type="button"
                    className={viewMode === 'list' ? css.viewButtonActive : css.viewButton}
                    aria-label="列表视图"
                    onClick={() => setViewMode('list')}
                  ><IconList size={16} /></button>
                </div>
              </div>
            </div>

            {history.isPending ? <div className={css.historyEmpty}>正在加载图片…</div> : null}
            {history.isSuccess && visibleImages.length === 0 ? (
              <div className={css.historyEmpty}>
                <span className={css.emptyImageIcon}><IconImage size={26} /></span>
                <strong>{timeFilter === 'all' ? '还没有上传过图片' : '这个时间范围内没有图片'}</strong>
                <span>上传后的图片会出现在这里，方便复制链接和管理。</span>
              </div>
            ) : null}

            <div className={viewMode === 'grid' ? css.imageGrid : css.imageList}>
              {visibleImages.map((image) => (
                <ImageCard
                  key={image.image_id}
                  image={image}
                  list={viewMode === 'list'}
                  copied={copied}
                  onCopy={copyText}
                  onDelete={(imageId) => {
                    if (window.confirm('确定删除这张图片吗？物理文件会一并删除。')) {
                      deleteMut.mutate(imageId)
                    }
                  }}
                />
              ))}
            </div>

            {history.isSuccess && history.data.total > 50 ? (
              <div className={css.pager}>
                <span>第 {page} 页</span>
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  disabled={page * 50 >= history.data.total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  下一页
                </Button>
              </div>
            ) : null}
          </section>
        </div>

        <aside className={css.sideColumn}>
          <section className={css.sidePanel}>
            <div className={css.panelHeading}>
              <h2 className={css.sectionTitle}>图床信息</h2>
              <span className={css.sidePanelIcon}><IconInfo size={16} /></span>
            </div>
            <p className={css.sideLabel}>当前图床目标</p>
            <div className={css.targetSummary}>
              <span className={css.targetIcon}><IconImage size={18} /></span>
              <div className={css.targetSummaryText}>
                <strong>{currentTargetData?.name ?? currentTarget}</strong>
                <span>{currentTarget}</span>
              </div>
              <span className={css.statusBadge}>正常</span>
            </div>
            <dl className={css.statList}>
              <Stat label="已上传图片" value={`${history.data?.total ?? 0} 张`} />
              <Stat label="今日上传" value={`${stats.today} 张`} />
              <Stat label="本月上传" value={`${stats.month} 张`} />
              <Stat label="当前页图片体积" value={formatBytes(stats.bytes)} />
            </dl>
            <Link to="/app/admin" search={{ section: 'sources' }} className={css.settingsLink}>
              <IconSettings size={16} /> 查看图床设置 <IconChevronRight size={14} />
            </Link>
          </section>

          <section className={css.sidePanel}>
            <div className={css.tutorialHeading}>
              <h2 className={css.sectionTitle}>如何在 PicGo 中使用</h2>
            </div>
            <ol className={css.steps}>
              <li>在个人设置中重置并复制图床 API Token。</li>
              <li>在 PicGo 中选择“自定义 Web 图床”。</li>
              <li>将接口地址填为上方 API 地址，并添加 Bearer Token。</li>
              <li>保存配置后即可直接上传到当前默认目标。</li>
            </ol>
            <Link to="/about" className={css.tutorialLink}>
              查看使用说明 <IconExternalLink size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </AppShell>
  )
}

function InfoRow({ label, value, action }: { label: string; value: string; action: ReactNode }) {
  return (
    <div className={css.infoRow}>
      <div className={css.infoText}>
        <span>{label}</span>
        <strong title={value}>{value}</strong>
      </div>
      {action}
    </div>
  )
}

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button type="button" className={css.copyButton} onClick={onClick} aria-label="复制">
      <IconCopy size={14} /> {copied ? '已复制' : '复制'}
    </button>
  )
}

function ImageCard({
  image,
  list,
  copied,
  onCopy,
  onDelete,
}: {
  image: ImageRecord
  list: boolean
  copied: string
  onCopy: (value: string, key: string) => Promise<void>
  onDelete: (imageId: string) => void
}) {
  const name = image.original_filename || `${image.image_id}.${image.ext}`
  const markdown = `![${name}](${image.public_url})`
  return (
    <article className={list ? css.imageCardList : css.imageCard}>
      <a href={image.public_url} target="_blank" rel="noreferrer" className={list ? css.thumbLinkList : css.thumbLink}>
        <img className={list ? css.imageThumbList : css.imageThumb} src={image.public_url} alt={name} loading="lazy" />
      </a>
      <div className={css.imageBody}>
        <strong className={css.imageName} title={name}>{name}</strong>
        <div className={css.imageMeta}>
          <span>{formatImageDate(image.created_at)}</span>
          <span>{image.width}×{image.height}</span>
          <span>{formatBytes(image.size)}</span>
        </div>
      </div>
      <div className={css.imageActions}>
        <button
          type="button"
          className={css.actionButton}
          aria-label="复制 Markdown"
          title={copied === `md-${image.image_id}` ? '已复制' : '复制 Markdown'}
          onClick={() => void onCopy(markdown, `md-${image.image_id}`)}
        ><IconLink size={15} /></button>
        <button
          type="button"
          className={css.actionButton}
          aria-label="复制图片链接"
          title={copied === `url-${image.image_id}` ? '已复制' : '复制链接'}
          onClick={() => void onCopy(image.public_url, `url-${image.image_id}`)}
        ><IconCopy size={15} /></button>
        <button
          type="button"
          className={css.deleteButton}
          aria-label="删除图片"
          onClick={() => onDelete(image.image_id)}
        ><IconTrash size={15} /></button>
      </div>
    </article>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className={css.statRow}><dt>{label}</dt><dd>{value}</dd></div>
}

function filterImages(images: ImageRecord[], filter: TimeFilter) {
  if (filter === 'all') return images
  const now = new Date()
  return images.filter((image) => {
    const date = new Date(image.created_at)
    if (filter === 'today') return date.toDateString() === now.toDateString()
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  })
}

function buildStats(images: ImageRecord[]) {
  const now = new Date()
  let today = 0
  let month = 0
  let bytes = 0
  for (const image of images) {
    const date = new Date(image.created_at)
    bytes += image.size
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
      month += 1
      if (date.toDateString() === now.toDateString()) today += 1
    }
  }
  return { today, month, bytes }
}

function formatImageDate(value: string) {
  const date = new Date(value)
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiRequestError ? error.message : fallback
}
