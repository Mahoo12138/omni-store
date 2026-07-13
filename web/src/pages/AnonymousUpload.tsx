import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAnonymousStatus, uploadAnonymousImage } from '../api/imagebed'
import { ApiRequestError } from '../api/client'
import { LogoMark } from '../components/ui/Icon'
import { IconCopy } from '../components/ui/Icon'
import * as css from './AuthForm.css'
import * as ib from './ImageBed.css'

export function AnonymousUploadPage() {
  const status = useQuery({ queryKey: ['anon-status'], queryFn: fetchAnonymousStatus })
  const [urls, setUrls] = useState<string[]>([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  async function onUpload(files: FileList | null) {
    if (!files?.length) return
    setError('')
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const res = await uploadAnonymousImage(file)
        setUrls((prev) => [res.url, ...prev])
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={css.page}>
      <div className={css.card}>
        <div className={css.brand}>
          <LogoMark size={32} />
          <span className={css.brandName}>OmniStore</span>
        </div>
        {status.isPending && <p className={css.subtitle}>加载中…</p>}
        {status.isSuccess && !status.data.enabled && (
          <>
            <p className={css.subtitle}>匿名公共图床当前未开启。</p>
            <p className={css.footer}>
              <a href="/">返回首页</a>
            </p>
          </>
        )}
        {status.isSuccess && status.data.enabled && (
          <>
            <p className={css.subtitle}>
              匿名上传图片（jpg / png / webp / gif，单张最大 {status.data.max_file_size_mb}MB）
            </p>
            <div className={css.form}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                disabled={uploading}
                onChange={(e) => onUpload(e.target.files)}
              />
              {uploading && <p className={css.subtitle}>上传中…</p>}
              {error && <p className={ib.error}>{error}</p>}
              {urls.map((url) => (
                <div key={url} className={ib.row} style={{ margin: 0 }}>
                  <a href={url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', fontSize: 12 }}>
                    {url}
                  </a>
                  <div className={ib.actionBtn} onClick={() => navigator.clipboard.writeText(url)}>
                    <IconCopy size={15} />
                  </div>
                </div>
              ))}
            </div>
            <p className={css.footer}>
              <a href="/">返回首页</a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
