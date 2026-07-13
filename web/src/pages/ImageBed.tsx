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
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { IconCopy, IconTrash } from '../components/ui/Icon'
import { formatBytes } from '../utils/format'
import * as css from './ImageBed.css'

export function ImageBedPage() {
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
        {targets.isSuccess && targets.data.targets.length === 0 && (
          <div className={css.emptyBlock}>
            <p>没有可用的图床目标。管理者需要为你分配一个支持图床的读写存储源。</p>
          </div>
        )}
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
