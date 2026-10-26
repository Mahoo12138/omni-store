import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { browsePublic, rawUrl } from '../api/public'
import { PublicBreadcrumb } from '../components/shell/PublicBreadcrumb'
import { PublicFrame } from '../components/shell/PublicFrame'
import { PageHeader } from '../components/shell/PageHeader'
import { FileTable } from '../components/files/FileTable'
import { Button } from '../components/ui/Button'
import {
  EntryIcon,
  IconDownload,
  IconGrid,
  IconInfo,
  IconList,
  IconRefresh,
  IconSearch,
} from '../components/ui/Icon'
import { formatBytes, formatDate } from '../utils/format'
import type { FileEntry } from '../api/sources'
import { useStyles as useFtStyles } from '../components/files/FileTable.styles'
import { ViewSwitcher } from '../components/shell/ViewSwitcher'
import { useStyles } from './PublicBrowse.styles'

type ViewMode = 'list' | 'grid'

// 公开目录浏览 /public/*（2.0 固定入口）：匿名只读，文件点击即在新页打开 raw。
export function PublicBrowsePage() {
  const ft = useFtStyles()
  const css = useStyles()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [view, setView] = useState<ViewMode>('list')

  // /public/photos/2026 -> photos/2026
  const virtualPath = decodeURIComponent(location.pathname.replace(/^\/public\/?/, '')).replace(/\/+$/, '')

  const browse = useQuery({
    queryKey: ['public-browse', virtualPath, page],
    queryFn: () => browsePublic('/' + virtualPath, page),
    enabled: true,
  })

  const segments = virtualPath.split('/').filter(Boolean)

  function goTo(p: string) {
    setFilter('')
    setPage(1)
    if (p === '') {
      navigate({ to: '/' })
    } else {
      navigate({ to: '/public/$', params: { _splat: p } })
    }
  }

  const entries = useMemo(() => {
    const items = browse.data?.items ?? []
    if (!filter.trim()) return items
    const q = filter.trim().toLowerCase()
    return items.filter((e) => e.name.toLowerCase().includes(q))
  }, [browse.data, filter])

  return (
    <PublicFrame>
      <PageHeader title="公开网盘" />
      <section aria-label={`公开目录：${segments.join('/')}`}>
        <header className={css.browseHeader}>
          <PublicBreadcrumb segments={segments} onNavigate={goTo} />
        </header>

        <div className={css.browsePanel}>
          <div className={ft.toolbar}>
            <div className={css.readOnlyNotice} role="note">
              <IconInfo size={15} />
              <span>公开目录仅支持预览和下载</span>
            </div>
            <div className={ft.toolbarGroup}>
              <span className={ft.searchBox}>
                <span className={ft.searchIcon}>
                  <IconSearch size={16} />
                </span>
                <input
                  className={ft.searchInput}
                  placeholder="搜索文件或文件夹"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </span>
              <ViewSwitcher
                ariaLabel="视图切换"
                iconOnly
                value={view}
                onChange={(next) => setView(next as ViewMode)}
                options={[
                  { value: 'list', label: '列表视图', icon: <IconList size={16} />, title: '列表视图' },
                  { value: 'grid', label: '网格视图', icon: <IconGrid size={16} />, title: '网格视图' },
                ]}
              />
              <Button
                variant="ghost"
                aria-label="刷新目录"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['public-browse'] })}
                title="刷新"
              >
                <IconRefresh />
              </Button>
            </div>
          </div>

          {view === 'list' ? (
            <FileTable
              entries={browse.isError ? [] : entries}
              loading={browse.isPending}
              emptyTitle={browse.isError ? '路径不存在或不可访问' : filter ? '没有匹配的条目' : '目录为空'}
              emptyHint={browse.isError ? '目录可能已被取消公开。' : undefined}
              onOpenDir={(name) => goTo(segments.concat(name).join('/'))}
              fileHref={(entry) => rawUrl(`${virtualPath}/${entry.name}`)}
              fileTarget="_blank"
              renderActions={(entry) =>
                entry.type === 'file' ? (
                  <span className={ft.actions}>
                    <a
                      className={ft.actionBtn}
                      href={rawUrl(`${virtualPath}/${entry.name}`, true)}
                      aria-label={`下载 ${entry.name}`}
                      title="下载"
                    >
                      <IconDownload size={16} />
                    </a>
                  </span>
                ) : null
              }
            />
          ) : (
            <FileGrid
              entries={browse.isError ? [] : entries}
              loading={browse.isPending}
              onOpenDir={(name) => goTo(segments.concat(name).join('/'))}
              virtualPath={virtualPath}
            />
          )}

          {browse.isSuccess && (browse.data.has_next || page > 1) && (
            <div className={ft.pager}>
              <span>共 {browse.data.total} 项</span>
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <Button
                variant="secondary"
                disabled={!browse.data.has_next}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      </section>
    </PublicFrame>
  )
}

// 网格视图（docs/index.png 右上角切换）：每个文件一个卡片（图标 + 名称 + 大小 / 时间）。
function FileGrid({
  entries,
  loading,
  onOpenDir,
  virtualPath,
}: {
  entries: FileEntry[]
  loading?: boolean
  onOpenDir: (name: string) => void
  virtualPath: string
}) {
  const css = useStyles()
  if (loading) {
    return (
      <div className={css.grid} aria-busy="true" aria-label="加载中">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={css.gridCard} aria-hidden="true">
            <div className={css.skeleton} style={{ width: 48, height: 48, borderRadius: 12 }} />
            <div className={css.skeleton} style={{ width: '70%', height: 14 }} />
          </div>
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className={css.gridEmpty}>
        <div className={css.gridEmptyTitle}>目录为空</div>
        <div>把文件或文件夹放进此目录后会显示在这里。</div>
      </div>
    )
  }

  return (
    <div className={css.grid}>
      {entries.map((entry) => (
        <GridCard
          key={entry.name}
          entry={entry}
          onOpenDir={onOpenDir}
          href={rawUrl(`${virtualPath}/${entry.name}`)}
        />
      ))}
    </div>
  )
}

function GridCard({
  entry,
  onOpenDir,
  href,
}: {
  entry: FileEntry
  onOpenDir: (name: string) => void
  href: string
}) {
  const css = useStyles()
  if (entry.type === 'dir') {
    return (
      <button className={css.gridCard} onClick={() => onOpenDir(entry.name)} title={entry.name}>
        <div className={css.gridIcon}>
          <EntryIcon name={entry.name} type="dir" size={48} />
        </div>
        <div className={css.gridName}>{entry.name}</div>
        <div className={css.gridMeta}>文件夹 · {formatDate(entry.mtime)}</div>
      </button>
    )
  }
  if (entry.type === 'file') {
    return (
      <a className={css.gridCard} href={href} target="_blank" rel="noreferrer" title={entry.name}>
        <div className={css.gridIcon}>
          <EntryIcon name={entry.name} type="file" size={48} />
        </div>
        <div className={css.gridName}>{entry.name}</div>
        <div className={css.gridMeta}>
          {formatBytes(entry.size)} · {formatDate(entry.mtime)}
        </div>
      </a>
    )
  }
  return null
}
