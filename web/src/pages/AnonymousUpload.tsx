import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAnonymousStatus, uploadAnonymousImage } from '../api/imagebed'
import { ApiRequestError } from '../api/client'
import { Button } from '../components/ui/Button'
import * as css from './AuthForm.css'

// 匿名公共图床上传页 /upload（README §24.1，未开启时显示不可用）。
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
        <h1 className={css.title}>公共图床</h1>
        {status.isPending && <p className={css.subtitle}>加载中…</p>}
        {status.isSuccess && !status.data.enabled && (
          <>
            <p className={css.subtitle}>匿名公共图床当前未开启。</p>
            <p className={css.footer}>
              <Link to="/">返回首页</Link>
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
              {error && <p className={css.error}>{error}</p>}
              {uploading && <p className={css.subtitle}>上传中…</p>}
              {urls.map((url) => (
                <p key={url} style={{ wordBreak: 'break-all', margin: 0 }}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {url}
                  </a>{' '}
                  <Button variant="secondary" onClick={() => navigator.clipboard.writeText(url)}>
                    复制
                  </Button>
                </p>
              ))}
            </div>
            <p className={css.footer}>
              <Link to="/">返回首页</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
