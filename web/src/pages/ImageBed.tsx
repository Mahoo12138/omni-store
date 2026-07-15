import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteImage,
  fetchImageBedTargets,
  fetchImageHistory,
  setDefaultImageBedTarget,
  uploadImage,
} from '../api/imagebed'
import { ApiRequestError } from '../api/client'
import { fetchMe } from '../api/auth'
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { IconCopy, IconTrash } from '../components/ui/Icon'
import { formatBytes } from '../utils/format'
import * as css from './ImageBed.css'

export function ImageBedPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const targets = useQuery({ queryKey: ['imagebed-targets'], queryFn: fetchImageBedTargets })
  const isAdmin = me.data?.role === 'super_admin'

  if (targets.isPending) {
    return (
      <AppShell title="图床">
        <div style={{ padding: 32, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          加载中…
        </div>
      </AppShell>
    )
  }

  // 没有可用图床目标 → 全屏空状态
  if (targets.isSuccess && targets.data.targets.length === 0) {
    return (
      <AppShell title="图床">
        <NoTargetView isAdmin={isAdmin} />
      </AppShell>
    )
  }

  return <ImageBedContent />
}

// --- 无图床目标空状态 ---

function NoTargetView({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className={css.emptyMain}>
      <div className={css.emptyIllustration}>
        <ImageBedEmptyIllustration />
      </div>
      <h2 className={css.emptyTitle}>
        {isAdmin ? '你还没有创建图床存储源' : '你还没有可用的图床目标'}
      </h2>
      <p className={css.emptyHint}>
        {isAdmin
          ? '请前往系统设置创建一个启用了图床功能的存储源，开始上传与管理图片。'
          : '当前没有可用于上传图片的存储源，请联系管理员分配具备图床权限的存储源，或切换到已有权限的存储源。'}
      </p>
    </div>
  )
}

// 云 + 图片 + 加号的空状态插画（对应设计稿）
function ImageBedEmptyIllustration() {
  return (
    <svg width="260" height="180" viewBox="0 0 260 180" fill="none" aria-hidden="true">
      {/* 大云 */}
      <path
        d="M70 50 c0 -14 12 -24 26 -24 c4 -10 14 -18 26 -18 c16 0 28 12 30 26 c2 -1 5 -2 8 -2 c10 0 18 8 18 18 c0 10 -8 18 -18 18 H72 c-12 0 -20 -8 -20 -18 z"
        fill="oklch(0.92 0.04 230)"
      />
      {/* 装饰小云 */}
      <ellipse cx="20" cy="42" rx="14" ry="6" fill="oklch(0.95 0.03 230)" />
      <ellipse cx="232" cy="36" rx="18" ry="7" fill="oklch(0.95 0.03 230)" />
      <ellipse cx="40" cy="78" rx="10" ry="4" fill="oklch(0.96 0.02 230)" />
      <ellipse cx="218" cy="86" rx="12" ry="5" fill="oklch(0.96 0.02 230)" />
      {/* 漂浮小点 */}
      <circle cx="50" cy="22" r="2" fill="oklch(0.86 0.06 230)" />
      <circle cx="210" cy="60" r="2.5" fill="oklch(0.86 0.06 230)" />
      <circle cx="12" cy="100" r="2" fill="oklch(0.86 0.06 230)" />
      <circle cx="248" cy="118" r="2" fill="oklch(0.86 0.06 230)" />
      {/* 主图片框 */}
      <rect
        x="50"
        y="68"
        width="120"
        height="92"
        rx="8"
        fill="oklch(0.95 0.04 230)"
        stroke="oklch(0.78 0.1 230)"
        strokeWidth="2"
      />
      <rect
        x="50"
        y="68"
        width="120"
        height="20"
        rx="8"
        fill="oklch(0.88 0.07 230)"
      />
      {/* 圆孔 */}
      <circle cx="62" cy="78" r="2" fill="oklch(0.78 0.1 230)" />
      <circle cx="70" cy="78" r="2" fill="oklch(0.78 0.1 230)" />
      {/* 太阳 */}
      <circle cx="140" cy="108" r="6" fill="oklch(0.92 0.09 80)" />
      {/* 山 */}
      <path d="M60 154 L92 116 L116 138 L140 108 L160 154 Z" fill="oklch(0.82 0.1 230)" />
      <path d="M84 154 L108 124 L130 154 Z" fill="oklch(0.88 0.08 230)" />
      {/* 第二个小相框（虚线 + 加号）*/}
      <rect
        x="168"
        y="108"
        width="60"
        height="52"
        rx="6"
        fill="oklch(0.97 0.02 230)"
        stroke="oklch(0.8 0.08 230)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <path
        d="M198 122 v12 M192 128 h12"
        stroke="oklch(0.7 0.12 230)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* 底部投影 */}
      <ellipse cx="125" cy="170" rx="80" ry="4" fill="oklch(0.94 0.02 230)" />
      {/* 装饰叶子 */}
      <path
        d="M178 156 q4 -10 14 -12 q-2 10 -14 12 z"
        fill="oklch(0.86 0.08 150)"
        opacity="0.7"
      />
      <path
        d="M30 158 q-6 -8 -2 -16 q8 4 2 16 z"
        fill="oklch(0.86 0.08 150)"
        opacity="0.6"
      />
    </svg>
  )
}

// --- 正常图床内容（已有目标）---

function ImageBedContent() {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [selectedTarget, setSelectedTarget] = useState('')
  const [msg, setMsg] = useState('')
  const [uploading, setUploading] = useState(false)
  const [page, setPage] = useState(1)

  const targets = useQuery({ queryKey: ['imagebed-targets'], queryFn: fetchImageBedTargets })
  const history = useQuery({
    queryKey: ['imagebed-history', page],
    queryFn: () => fetchImageHistory(page),
  })

  const currentTarget = selectedTarget || targets.data?.default_source_id || ''

  const setDefaultMut = useMutation({
    mutationFn: setDefaultImageBedTarget,
    onSuccess: () => {
      setMsg('默认目标已更新')
      queryClient.invalidateQueries({ queryKey: ['imagebed-targets'] })
    },
    onError: (err) => setMsg(err instanceof ApiRequestError ? err.message : '设置失败'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteImage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['imagebed-history'] }),
    onError: (err) => alert(err instanceof ApiRequestError ? err.message : '删除失败'),
  })

  async function onUpload(files: FileList | null) {
    if (!files?.length) return
    setMsg('')
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadImage(file, currentTarget || undefined)
      }
      queryClient.invalidateQueries({ queryKey: ['imagebed-history'] })
    } catch (err) {
      setMsg(err instanceof ApiRequestError ? err.message : '上传失败')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <AppShell title="图床">
      <section className={css.section}>
        <h2 className={css.sectionTitle}>上传图片</h2>
        {targets.isSuccess && targets.data.targets.length > 0 && (
          <>
            <div className={css.row}>
              <span className={css.label}>目标存储源：</span>
              <select
                className={css.select}
                value={currentTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
              >
                {targets.data.targets.map((t) => (
                  <option key={t.source_id} value={t.source_id}>
                    {t.name}
                    {t.source_id === targets.data.default_source_id ? '（默认）' : ''}
                  </option>
                ))}
              </select>
              {currentTarget && currentTarget !== targets.data.default_source_id && (
                <Button variant="secondary" onClick={() => setDefaultMut.mutate(currentTarget)}>
                  设为默认
                </Button>
              )}
            </div>
            <div className={css.row}>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                disabled={uploading}
                onChange={(e) => onUpload(e.target.files)}
              />
              {uploading && <span className={css.label}>上传中…</span>}
            </div>
            {msg && <p className={css.error}>{msg}</p>}
          </>
        )}
      </section>

      <section className={css.section}>
        <h2 className={css.sectionTitle}>我的图片</h2>
        {history.isSuccess && history.data.items.length === 0 && (
          <div className={css.emptyBlock}>
            <p>还没有上传过图片。</p>
          </div>
        )}
        <div className={css.grid}>
          {history.data?.items.map((img) => (
            <div key={img.image_id} className={css.imageCard}>
              <a href={img.public_url} target="_blank" rel="noreferrer">
                <img
                  className={css.imageThumb}
                  src={img.public_url}
                  alt={img.original_filename || img.image_id}
                  loading="lazy"
                />
              </a>
              <div className={css.imageMeta}>
                {img.width}×{img.height} · {formatBytes(img.size)}
              </div>
              <div className={css.imageActions}>
                <button
                  className={css.actionBtn}
                  aria-label="复制链接"
                  onClick={() => navigator.clipboard.writeText(img.public_url)}
                >
                  <IconCopy size={15} />
                </button>
                <button
                  className={css.actionBtnDanger}
                  aria-label="删除"
                  onClick={() => {
                    if (confirm('确定删除这张图片吗？物理文件会一并删除。')) {
                      deleteMut.mutate(img.image_id)
                    }
                  }}
                >
                  <IconTrash size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {history.isSuccess && history.data.total > 50 && (
          <div className={css.pager}>
            <span>共 {history.data.total} 张</span>
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </Button>
            <Button
              variant="secondary"
              disabled={page * 50 >= history.data.total}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        )}
      </section>
    </AppShell>
  )
}
