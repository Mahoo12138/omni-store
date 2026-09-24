import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import { fetchRecentFiles } from '../api/recentFiles'
import { downloadFileUrl } from '../api/sources'
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { IconActivity, IconDownload, IconFile, IconFolder } from '../components/ui/Icon'
import { formatBytes, formatDate } from '../utils/format'
import * as css from './RecentFiles.css'

export function RecentFilesPage() {
  const navigate = useNavigate()
  const recent = useQuery({ queryKey: ['recent-files'], queryFn: () => fetchRecentFiles(50) })
  const files = recent.data ?? []

  function openParent(sourceKey: string, filePath: string) {
    const parent = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''
    navigate({
      to: '/app/sources/$sourceKey',
      params: { sourceKey },
      search: { path: parent ? `/${parent}` : '/', page: 1 },
    })
  }

  return (
    <AppShell title="最近文件">
      <header className={css.header}>
        <span className={css.eyebrow}>文件台账</span>
        <h1 className={css.title}>最近文件</h1>
        <p className={css.description}>你最近上传、下载或整理过的文件。这里只显示当前仍可访问的文件。</p>
      </header>

      {recent.isPending ? (
        <section className={css.state} aria-busy="true" role="status">正在读取最近文件…</section>
      ) : recent.isError ? (
        <section className={css.state} role="alert">
          <h2>最近文件加载失败</h2>
          <p>{recent.error instanceof ApiRequestError ? recent.error.message : '请检查连接后重试。'}</p>
          <Button variant="secondary" onClick={() => recent.refetch()}>重新加载</Button>
        </section>
      ) : files.length === 0 ? (
        <section className={css.state}>
          <span className={css.emptyIcon}><IconActivity size={25} /></span>
          <h2>还没有最近文件</h2>
          <p>上传、下载或整理文件后，它们会出现在这里。</p>
          <Link to="/app">前往文件</Link>
        </section>
      ) : (
        <section className={css.panel} aria-label="最近文件列表">
          <div className={css.panelHeader}>
            <h2>最近访问</h2>
            <span>最多显示 50 个</span>
          </div>
          <div className={css.list}>
            {files.map((file) => (
              <article className={css.row} key={`${file.source_key}:${file.path}`}>
                <span className={css.fileIcon}><IconFile size={19} /></span>
                <div className={css.identity}>
                  <button type="button" className={css.fileName} onClick={() => openParent(file.source_key, file.path)}>
                    {file.name}
                  </button>
                  <button type="button" className={css.location} onClick={() => openParent(file.source_key, file.path)}>
                    <IconFolder size={13} /> {file.source_name} / {file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''}
                  </button>
                </div>
                <div className={css.metadata}>
                  <span>{formatBytes(file.size)}</span>
                  <time dateTime={file.accessed_at}>最近操作 {formatDate(file.accessed_at)}</time>
                </div>
                <a
                  className={css.download}
                  href={downloadFileUrl(file.source_key, `/${file.path}`)}
                  download={file.name}
                  aria-label={`下载 ${file.name}`}
                  title={`下载 ${file.name}`}
                >
                  <IconDownload size={17} />
                </a>
              </article>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  )
}
