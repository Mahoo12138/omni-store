import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import { fetchMe } from '../api/auth'
import { downloadFileUrl, fetchMySources, type UserSource } from '../api/sources'
import { fetchRecentFiles, type RecentFile } from '../api/recentFiles'
import { AppFrame } from '../components/shell/AppFrame'
import { StateView } from '../components/shell/StateView'
import { Banner } from '../components/shell/Banner'
import { Button } from '../components/ui/Button'
import { LinkButton } from '../components/ui/LinkButton'
import { openSearchDialog } from '../components/search/SearchDialog'
import {
  IconChevronRight,
  IconDownload,
  IconFile,
  IconFolder,
  IconFolderFilled,
  IconSearch,
} from '../components/ui/Icon'
import { formatBytes, formatDate } from '../utils/format'
import { useStyles } from './Dashboard.styles'

// /app 首页：存储源与最近文件单列堆叠。
export function AppHomePage() {
  const css = useStyles()
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const recent = useQuery({ queryKey: ['recent-files'], queryFn: () => fetchRecentFiles(50) })

  const sourceList = sources.data ?? []
  const isAdmin = me.data?.role === 'super_admin'
  const now = new Date()
  const displayName = me.data?.display_name

  function openSource(sourceKey: string) {
    navigate({
      to: '/app/sources/$sourceKey',
      params: { sourceKey },
      search: { path: '/', page: 1 },
    })
  }

  function openRecentParent(sourceKey: string, filePath: string) {
    const parent = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''
    navigate({
      to: '/app/sources/$sourceKey',
      params: { sourceKey },
      search: { path: parent ? `/${parent}` : '/', page: 1 },
    })
  }

  return (
    <AppFrame title="文件">
      <header className={css.pageHeader}>
        <div className={css.headerCopy}>
          <time className={css.welcomeDate} dateTime={now.toISOString()}>{formatWelcomeDate(now)}</time>
          <h1 className={css.pageTitle}>{displayName ? `${timeGreeting(now)}，${displayName}` : '我的文件'}</h1>
        </div>
        <Button variant="secondary" onClick={openSearchDialog}>
          <IconSearch size={16} />
          搜索
        </Button>
      </header>

      <div className={css.workspace}>
        <section className={css.cardSection} aria-labelledby="sources-title">
          <div className={css.sectionHeader}>
            <h2 id="sources-title" className={css.sectionTitle}>存储源</h2>
            {sources.isSuccess && sourceList.length > 0 && (
              <span className={css.sectionMeta}>{sourceList.length} 个可用</span>
            )}
          </div>

          {sources.isPending ? (
            <SourceListLoading />
          ) : sources.isError ? (
            <Banner
              intent="error"
              title="无法加载存储源"
              action={<Button variant="secondary" onClick={() => sources.refetch()}>重新加载</Button>}
            >请检查网络连接后重试。</Banner>
          ) : sourceList.length === 0 ? (
            <NoSourceView isAdmin={isAdmin} />
          ) : (
            <div className={css.sourceList}>
              {sourceList.map((source) => (
                <button
                  type="button"
                  key={source.key}
                  className={css.sourceRow}
                  onClick={() => openSource(source.key)}
                  aria-label={`打开存储源 ${source.name}`}
                >
                  <span className={css.sourceIdentity}>
                    <span className={css.sourceIcon}><IconFolderFilled size={28} /></span>
                    <span className={css.sourceText}>
                      <strong>{source.name}</strong>
                      <span>{source.description || '本地目录'}</span>
                    </span>
                  </span>
                  <span className={css.sourceCapabilities}>{capabilities(source)}</span>
                  <span className={css.openAction}>
                    打开 <IconChevronRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <RecentFilesPanel
          files={recent.data}
          pending={recent.isPending}
          error={recent.error}
          onRetry={() => recent.refetch()}
          onOpenParent={openRecentParent}
        />
      </div>
    </AppFrame>
  )
}

function capabilities(source: UserSource): string {
  const parts = [source.permission === 'read_write' ? '读写' : '只读']
  if (source.webdav_enabled) parts.push('WebDAV')
  if (source.s3_enabled) parts.push('S3')
  return parts.join(' · ')
}

function SourceListLoading() {
  const css = useStyles()
  return (
    <div className={css.sourceList} role="status" aria-busy="true" aria-label="正在加载存储源">
      {[0, 1, 2].map((item) => (
        <div className={css.sourceSkeleton} key={item} aria-hidden="true">
          <span className={css.skeletonIcon} />
          <span className={css.skeletonText}>
            <i />
            <i />
          </span>
          <span className={css.skeletonMeta} />
        </div>
      ))}
    </div>
  )
}

function NoSourceView({ isAdmin }: { isAdmin: boolean }) {
  const css = useStyles()
  return (
    <div className={css.emptyState}>
      <span className={css.emptyIcon}><IconFolderFilled size={34} /></span>
      <div>
        <h3>{isAdmin ? '创建第一个存储源' : '还没有可用的存储源'}</h3>
        <p>{isAdmin ? '连接服务器上的目录后，就可以上传、整理和共享文件。' : '请联系系统管理员分配访问权限。'}</p>
      </div>
      {isAdmin && (
        <LinkButton to="/app/admin" search={{ section: 'sources' }} variant="secondary">
          配置存储源
        </LinkButton>
      )}
    </div>
  )
}

// 原独立页面 /app/recent 的内容，迁移为首页右侧面板。
function RecentFilesPanel({
  files,
  pending,
  error,
  onRetry,
  onOpenParent,
}: {
  files: RecentFile[] | undefined
  pending: boolean
  error: unknown
  onRetry: () => void
  onOpenParent: (sourceKey: string, filePath: string) => void
}) {
  const css = useStyles()
  const items = files ?? []
  return (
    <section className={css.recentPanel} aria-labelledby="recent-title">
      <div className={css.recentHeader}>
        <h2 id="recent-title" className={css.sectionTitle}>最近文件</h2>
        {items.length > 0 && <span className={css.sectionMeta}>最多显示 50 个</span>}
      </div>
      {pending ? (
        <div className={css.recentList} role="status" aria-busy="true" aria-label="正在读取最近文件">
          {[0, 1, 2, 3].map((item) => (
            <div className={css.recentSkeleton} key={item} aria-hidden="true">
              <i className={css.recentSkeletonIcon} />
              <span className={css.recentSkeletonLines}><i /><i /></span>
            </div>
          ))}
        </div>
      ) : error ? (
        <Banner
          intent="error"
          title="最近文件加载失败"
          action={<Button variant="secondary" onClick={onRetry}>重新加载</Button>}
        >{error instanceof ApiRequestError ? error.message : '请检查连接后重试。'}</Banner>
      ) : items.length === 0 ? (
        <StateView
          layout="plain"
          kind="empty"
          title="还没有最近文件"
          description="上传、下载或整理文件后，它们会出现在这里。"
        />
      ) : (
        <div className={css.recentList}>
          {items.map((file) => {
            const parent = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
            return (
              <article className={css.recentRow} key={`${file.source_key}:${file.path}`}>
                <span className={css.recentFileIcon}><IconFile size={19} /></span>
                <div className={css.recentIdentity}>
                  <button
                    type="button"
                    className={css.recentFileName}
                    onClick={() => onOpenParent(file.source_key, file.path)}
                  >
                    {file.name}
                  </button>
                  <button
                    type="button"
                    className={css.recentLocation}
                    onClick={() => onOpenParent(file.source_key, file.path)}
                  >
                    <IconFolder size={13} /> {file.source_name} / {parent}
                  </button>
                  <span className={css.recentMeta}>
                    {formatBytes(file.size)} · <time dateTime={file.accessed_at}>最近操作 {formatDate(file.accessed_at)}</time>
                  </span>
                </div>
                <a
                  className={css.recentDownload}
                  href={downloadFileUrl(file.source_key, `/${file.path}`)}
                  download={file.name}
                  aria-label={`下载 ${file.name}`}
                  title={`下载 ${file.name}`}
                >
                  <IconDownload size={17} />
                </a>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function timeGreeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function formatWelcomeDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date)
}
