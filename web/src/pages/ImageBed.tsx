import { useMemo, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteImage,
  fetchImageBedStatus,
  fetchImageHistory,
  fetchTokenStatus,
  uploadImage,
} from '../api/imagebed'
import type { ImageRecord } from '../api/imagebed'
import { ApiRequestError } from '../api/client'
import { fetchMe } from '../api/auth'
import { AppFrame } from '../components/shell/AppFrame'
import { PageHeader } from '../components/shell/PageHeader'
import { ViewSwitcher } from '../components/shell/ViewSwitcher'
import { StateView } from '../components/shell/StateView'
import { Image, mergeClasses } from '@fluentui/react-components'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { LinkButton } from '../components/ui/LinkButton'
import { DialogWrap } from '../components/ui/Dialog'
import { Select } from '../components/ui/Select'
import {
  IconCloud,
  IconCopy,
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
import { toastError, toastSuccess } from '../components/ui/Toast'
import { useStyles } from './ImageBed.styles'

type StatusData = Awaited<ReturnType<typeof fetchImageBedStatus>>
type TimeFilter = 'all' | 'today' | 'month'
type ViewMode = 'grid' | 'list'

export function ImageBedPage() {
  const css = useStyles()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const status = useQuery({ queryKey: ['imagebed-status'], queryFn: fetchImageBedStatus })
  const isAdmin = me.data?.role === 'super_admin'

  if (status.isPending) {
    return (
      <AppFrame title="图床">
        <div className={css.loadingState} aria-busy="true">正在加载图床…</div>
      </AppFrame>
    )
  }

  if (status.isError) {
    return (
      <AppFrame title="图床">
        <PageHeader title="图床" />
        <StateView
          kind="error"
          icon={<IconCloud size={22} />}
          title="图床加载失败"
          description={status.error instanceof ApiRequestError
            ? status.error.message
            : '无法连接到实例服务，请稍后重新加载。'}
          action={<Button onClick={() => status.refetch()}>重新加载</Button>}
        />
      </AppFrame>
    )
  }

  if (status.isSuccess && !status.data.available) {
    return (
      <AppFrame title="图床">
        <PageHeader title="图床" />
        <NoTargetView isAdmin={isAdmin} />
      </AppFrame>
    )
  }

  if (!status.data) return null

  return <ImageBedContent status={status.data} />
}

function NoTargetView({ isAdmin }: { isAdmin: boolean }) {
  return (
    <StateView
      kind="unavailable"
      icon={<IconCloud size={22} />}
      title="图床尚未开启"
      description={isAdmin
        ? '在系统设置的「站点配置 → 站点服务」中为图床绑定存储源并开启后，即可在这里上传和管理图片。'
        : '图床能力未开启或未绑定存储源，请联系管理员。'}
      action={isAdmin ? (
        <LinkButton to="/app/admin" search={{ section: 'site', tab: 'services' }} variant="secondary">
          前往系统设置
        </LinkButton>
      ) : undefined}
    />
  )
}

function ImageBedContent({ status }: { status: StatusData }) {
  const css = useStyles()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [page, setPage] = useState(1)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [copied, setCopied] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ImageRecord | null>(null)

  const history = useQuery({
    queryKey: ['imagebed-history', page],
    queryFn: () => fetchImageHistory(page),
  })
  const tokenStatus = useQuery({ queryKey: ['token-status'], queryFn: fetchTokenStatus })

  const apiEndpoint = `${window.location.origin}/api/v1/image-bed/upload`

  const visibleImages = useMemo(
    () => filterImages(history.data?.items ?? [], timeFilter),
    [history.data?.items, timeFilter],
  )
  const stats = useMemo(() => buildStats(history.data?.items ?? []), [history.data?.items])

  const deleteMut = useMutation({
    mutationFn: deleteImage,
    onSuccess: async () => {
      setDeleteTarget(null)
      toastSuccess('图片已删除')
      await queryClient.invalidateQueries({ queryKey: ['imagebed-history'] })
    },
    onError: (error) => toastError(errorMessage(error, '删除失败')),
  })

  async function onUpload(files: FileList | File[]) {
    const queuedFiles = Array.from(files)
    if (queuedFiles.length === 0) return
    setUploading(true)
    try {
      for (const file of queuedFiles) await uploadImage(file)
      toastSuccess(`${queuedFiles.length} 张图片上传成功`)
      await queryClient.invalidateQueries({ queryKey: ['imagebed-history'] })
    } catch (error) {
      toastError(errorMessage(error, '上传失败'))
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
    <AppFrame title="图床">
      <PageHeader
        title="图床"
        actions={<>
          <Badge color="green">正常</Badge>
          <Button variant="ghost" icon={<IconInfo size={16} />} onClick={() => setInfoOpen(true)}>图床信息</Button>
        </>}
      />

      <section className={css.dropPanel} aria-labelledby="upload-title">
        <button
          type="button"
          className={mergeClasses(css.dropZone, dragging ? css.dropZoneActive : '')}
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
          }}
          onDrop={onDrop}
        >
          <span className={css.uploadIcon}><IconCloud size={28} /></span>
          <span className={css.dropCopy}>
            <strong id="upload-title" className={css.uploadTitle}>
              {uploading ? '正在上传图片…' : '拖拽图片到这里，或点击上传'}
            </strong>
            <span className={css.uploadHint}>支持 JPG、PNG、WEBP、GIF，单张不超过 10MB</span>
          </span>
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
                <Select
                  value={timeFilter}
                  onValueChange={(nextValue) => setTimeFilter(nextValue as TimeFilter)}
                  options={[
                    { value: 'all', label: '全部时间' },
                    { value: 'today', label: '今天' },
                    { value: 'month', label: '本月' },
                  ]}
                  ariaLabel="按时间筛选"
                  width="content"
                />
                <ViewSwitcher
                  ariaLabel="显示方式"
                  iconOnly
                  value={viewMode}
                  onChange={(next) => setViewMode(next as ViewMode)}
                  options={[
                    { value: 'grid', label: '网格视图', icon: <IconGrid size={16} /> },
                    { value: 'list', label: '列表视图', icon: <IconList size={16} /> },
                  ]}
                />
              </div>
            </div>

            {history.isPending ? <StateView kind="pending" title="正在加载图片…" /> : null}
            {history.isSuccess && visibleImages.length === 0 ? (
              timeFilter === 'all'
                ? (
                  <StateView
                    kind="empty"
                    icon={<IconImage size={22} />}
                    title="还没有上传过图片"
                  />
                )
                : <StateView kind="filtered" icon={<IconImage size={22} />} title="这个时间范围内没有图片" />
            ) : null}

            <div className={viewMode === 'grid' ? css.imageGrid : css.imageList}>
              {visibleImages.map((image) => (
                <ImageCard
                  key={image.image_id}
                  image={image}
                  list={viewMode === 'list'}
                  copied={copied}
                  onCopy={copyText}
                  onDelete={() => setDeleteTarget(image)}
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

      {infoOpen ? (
        <DialogWrap
          open
          onOpenChange={(open) => { if (!open) setInfoOpen(false) }}
          title="图床信息"
          footer={<Button variant="secondary" onClick={() => setInfoOpen(false)}>关闭</Button>}
        >
          <div className={css.infoModalBody}>
            <div>
              <p className={css.sideLabel}>当前图床目标</p>
              <div className={css.targetSummary}>
                <span className={css.targetSummaryIcon}><IconImage size={18} /></span>
                <div className={css.targetSummaryText}>
                  <strong>{status.source_name || '已绑定存储源'}</strong>
                  <span>全站唯一</span>
                </div>
                <span className={css.statusBadge}>正常</span>
              </div>
            </div>
            <dl className={css.statList}>
              <Stat label="已上传图片" value={`${history.data?.total ?? 0} 张`} />
              <Stat label="今日上传" value={`${stats.today} 张`} />
              <Stat label="本月上传" value={`${stats.month} 张`} />
              <Stat label="当前页图片体积" value={formatBytes(stats.bytes)} />
            </dl>
            <div className={css.infoModalSection}>
              <p className={css.sideLabel}>接口信息</p>
              <InfoRow
                label="PicGo API Token"
                value={tokenStatus.data?.image_bed.exists ? `已配置 ${tokenStatus.data.image_bed.count} 个 · 明文仅在创建时显示` : '尚未配置'}
                action={
                  <Link to="/app/settings" search={{ section: 'profile' }} onClick={() => setInfoOpen(false)}>
                    管理
                  </Link>
                }
              />
              <InfoRow
                label="API 接口地址"
                value={apiEndpoint}
                action={<CopyButton copied={copied === 'api'} onClick={() => void copyText(apiEndpoint, 'api')} />}
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
            </div>
            <LinkButton
              to="/app/admin"
              search={{ section: 'site', tab: 'services' }}
              variant="secondary"
              icon={<IconSettings size={16} />}
              onClick={() => setInfoOpen(false)}
            >查看图床设置</LinkButton>
          </div>
        </DialogWrap>
      ) : null}

      {deleteTarget ? (
        <DialogWrap
          open
          onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
          title="删除图片"
          description={`“${deleteTarget.original_filename || `${deleteTarget.image_id}.${deleteTarget.ext}`}”删除后无法恢复。`}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button variant="danger" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(deleteTarget.image_id)}>
                {deleteMut.isPending ? '删除中…' : '删除图片'}
              </Button>
            </>
          )}
        >
          <p style={{ margin: 0 }}>物理文件会一并删除，请确认继续。</p>
        </DialogWrap>
      ) : null}
    </AppFrame>
  )
}

function InfoRow({ label, value, action }: { label: string; value: string; action: ReactNode }) {
  const css = useStyles()
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
    <Button
      variant="ghost"
      onClick={onClick}
      aria-label="复制"
      title="复制"
      icon={<IconCopy size={14} />}
    >{copied ? '已复制' : '复制'}</Button>
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
  const css = useStyles()
  const name = image.original_filename || `${image.image_id}.${image.ext}`
  const markdown = `![${name}](${image.public_url})`
  return (
    <article className={list ? css.imageCardList : css.imageCard}>
      <a href={image.public_url} target="_blank" rel="noreferrer" className={list ? css.thumbLinkList : css.thumbLink}>
        <Image className={list ? css.imageThumbList : css.imageThumb} fit="cover" src={image.thumbnail_url || image.public_url} alt={name} loading="lazy" />
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
  const css = useStyles()
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
