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
import { formatBytes, formatDate } from '../utils/format'
import * as fm from './FileManager.css'
import * as css from './ImageBed.css'

// 登录用户图床：上传 + 历史墙（README §17/§25.8）。
export function ImageBedPage() {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [selectedTarget, setSelectedTarget] = useState('')
  const [error, setError] = useState('')
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['imagebed-targets'] }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : '设置失败'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteImage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['imagebed-history'] }),
    onError: (err) => alert(err instanceof ApiRequestError ? err.message : '删除失败'),
  })

  async function onUpload(files: FileList | null) {
    if (!files?.length) return
    setError('')
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadImage(file, currentTarget || undefined)
      }
      queryClient.invalidateQueries({ queryKey: ['imagebed-history'] })
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : '上传失败')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <AppShell>
      <h1 className={fm.pageTitle}>图床</h1>

      <section className={css.section}>
        <h2 className={css.sectionTitle}>上传图片</h2>
        {targets.isSuccess && targets.data.targets.length === 0 && (
          <p className={css.muted}>没有可用的图床目标。需要一个你有读写权限且开启了图床能力的存储源。</p>
        )}
        {targets.isSuccess && targets.data.targets.length > 0 && (
          <>
            <div className={css.row}>
              <span className={css.muted}>目标存储源：</span>
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
              {uploading && <span className={css.muted}>上传中…</span>}
            </div>
            {error && <p className={css.error}>{error}</p>}
          </>
        )}
      </section>

      <section className={css.section}>
        <h2 className={css.sectionTitle}>我的图片</h2>
        {history.isSuccess && history.data.items.length === 0 && (
          <p className={css.muted}>还没有上传过图片。</p>
        )}
        <div className={css.grid}>
          {history.data?.items.map((img) => (
            <div key={img.image_id} className={css.imageCard}>
              <a href={img.public_url} target="_blank" rel="noreferrer">
                <img className={css.imageThumb} src={img.public_url} alt={img.original_filename} loading="lazy" />
              </a>
              <div className={css.imageMeta}>
                {img.original_filename || img.image_id}
                <br />
                {img.width}×{img.height} · {formatBytes(img.size)} · {formatDate(img.created_at)}
              </div>
              <div className={css.imageActions}>
                <Button
                  variant="secondary"
                  onClick={() => navigator.clipboard.writeText(img.public_url)}
                >
                  复制链接
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm('确定删除这张图片吗？物理文件会一并删除。')) {
                      deleteMut.mutate(img.image_id)
                    }
                  }}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
        {history.isSuccess && history.data.total > 50 && (
          <div className={fm.pager}>
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
