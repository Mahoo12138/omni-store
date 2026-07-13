import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createFolder,
  deleteFile,
  downloadFileUrl,
  fetchMySources,
  listFiles,
  moveFile,
  renameFile,
  uploadFile,
  type FileEntry,
  type UserSource,
} from '../api/sources'
import { ApiRequestError } from '../api/client'
import { AppShell } from '../components/layout/AppShell'
import { FileTable } from '../components/files/FileTable'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { DialogWrap } from '../components/ui/Dialog'
import { Field } from '../components/ui/Field'
import { Input } from '../components/ui/Input'
import {
  IconChevronLeft,
  IconChevronRight,
  IconCloud,
  IconCopy,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconFolderPlus,
  IconGrid,
  IconHome,
  IconLink,
  IconList,
  IconMove,
  IconQuestion,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUpload,
} from '../components/ui/Icon'
import { vars } from '../styles/theme.css'
import * as css from './FileManager.css'

type ViewMode = 'list' | 'grid'
const PAGE_SIZE = 20

// /app/sources/$sourceId（docs/file.png / file-1.png）：
//   - 有存储源：标题 / 状态行 / 按钮 + 面包屑 / 工具条 / 表格 / 分页 + 右侧存储源信息卡
//   - 没有可用存储源：空状态 + 右侧"暂无可用存储源"卡
export function FileManagerPage() {
  const { sourceId } = useParams({ from: '/app/sources/$sourceId' })
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const source = sources.data?.find((s) => s.source_id === sourceId)

  // 1) 加载中
  if (sources.isPending) {
    return (
      <AppShell title="文件">
        <div style={{ padding: 32, color: vars.color.textSecondary, textAlign: 'center' }}>加载中…</div>
      </AppShell>
    )
  }

  // 2) 无任何存储源
  if (sources.isSuccess && sources.data.length === 0) {
    return (
      <AppShell title="文件管理">
        <NoSourceView />
      </AppShell>
    )
  }

  // 3) URL 里指定的 sourceId 不可用
  if (sources.isSuccess && !source) {
    return (
      <AppShell title="文件管理">
        <NoSourceView />
      </AppShell>
    )
  }

  // 4) 正常文件管理视图
  if (!source) return null
  return <FileManagerView source={source} />
}

// --- 主视图 ---

function FileManagerView({ source }: { source: UserSource }) {
  const sourceId = source.source_id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ from: '/app/sources/$sourceId' })
  const currentPath = search.path || '/'
  const page = search.page ?? 1

  const fileInput = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState('')
  const [view, setView] = useState<ViewMode>('list')

  // 各种操作弹窗
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ name: string } | null>(null)
  const [moveTarget, setMoveTarget] = useState<{ name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; type: string } | null>(null)

  const canWrite = source.permission === 'read_write'

  const filesQuery = useQuery({
    queryKey: ['files', sourceId, currentPath, page],
    queryFn: () => listFiles(sourceId, { path: currentPath, page, pageSize: PAGE_SIZE }),
  })

  const total = filesQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['files', sourceId] })
  }

  function goTo(seg: string) {
    setFilter('')
    const abs = currentPath === '/' ? `/${seg}` : `${currentPath}/${seg}`
    navigate({ to: '/app/sources/$sourceId', params: { sourceId }, search: { path: abs, page: 1 } })
  }

  function upOne() {
    const parent = currentPath.replace(/\/[^/]+$/, '') || '/'
    navigate({ to: '/app/sources/$sourceId', params: { sourceId }, search: { path: parent, page: 1 } })
  }

  function goPage(p: number) {
    navigate({
      to: '/app/sources/$sourceId',
      params: { sourceId },
      search: { path: currentPath, page: p },
    })
  }

  const entries = useMemo(
    () =>
      filesQuery.data?.items.filter((e) => {
        if (!filter.trim()) return true
        return e.name.toLowerCase().includes(filter.trim().toLowerCase())
      }) ?? [],
    [filesQuery.data, filter],
  )

  const onError = (err: unknown) => alert(err instanceof ApiRequestError ? err.message : '操作失败')

  async function onUpload(files: FileList | null) {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      try {
        await uploadFile(sourceId, currentPath, file)
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'FILE_ALREADY_EXISTS') {
          if (confirm(`文件 ${file.name} 已存在，是否覆盖？`)) {
            try { await uploadFile(sourceId, currentPath, file, true) } catch (e) { onError(e) }
          }
        } else {
          onError(err)
        }
      }
    }
    refresh()
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <AppShell title={source.name}>
      {/* 页面头：标题 / 状态行 / 顶部操作按钮 */}
      <div className={css.pageHeader}>
        <h1 className={css.pageTitle}>
          {source.name}
          <span className={css.pageTitleMuted}>/ 文件管理</span>
        </h1>

        <div className={css.metaRow}>
          <span className={css.metaItem}>
            <span className={css.metaLabel}>Source ID:</span>
            <span className={css.metaValue}>{sourceId}</span>
          </span>
          <span className={css.metaItem}>
            <span className={css.metaLabel}>真实路径:</span>
            <span className={css.metaValue} title={sourceId}>
              {/* 普通用户不可见真实路径；管理员视图在管理后台展示 */}
              {canWrite ? `…/${sourceId}` : '（仅管理员可见）'}
            </span>
          </span>
          {source.public_read_enabled && source.public_mount_path && (
            <span className={css.metaItem}>
              <span className={css.metaLabel}>公开挂载路径:</span>
              <a
                className={css.sideLink}
                href={`/public${source.public_mount_path}`}
                target="_blank"
                rel="noreferrer"
              >
                {source.public_mount_path}
                <IconExternalLink size={12} />
              </a>
            </span>
          )}
          <div className={css.statusRow}>
            <Badge color="green">正常</Badge>
            {source.public_read_enabled && source.public_mount_path && (
              <Badge color="green">已公开</Badge>
            )}
            {source.webdav_enabled && <Badge color="gray">WebDAV 已启用</Badge>}
            {source.image_bed_enabled && <Badge color="purple">图床 已启用</Badge>}
          </div>
        </div>

        <div className={css.headerActions} style={{ marginLeft: 'auto' }}>
          {canWrite && (
            <>
              <Button onClick={() => fileInput.current?.click()}>
                <IconUpload size={14} /> 上传文件
              </Button>
              <Button variant="secondary" onClick={() => setMkdirOpen(true)}>
                <IconFolderPlus size={14} /> 创建文件夹
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => onUpload(e.target.files)}
              />
            </>
          )}
          <Button
            variant="secondary"
            onClick={() => navigate({ to: '/app' })}
          >
            返回存储源列表
          </Button>
        </div>
      </div>

      <div className={css.layout}>
        <div className={css.main}>
          {/* 面包屑：存储源列表 / 源名 / 子路径 */}
          <Breadcrumb sourceId={sourceId} currentPath={currentPath} upOne={upOne} />

          {/* 工具条：当前位置 / 搜索 / 视图切换 / 刷新 */}
          <div className={css.toolbar}>
            <span className={css.toolbarLocation}>
              当前位置: <strong style={{ color: vars.color.text }}>{currentPath}</strong>
            </span>
            <span className={css.searchBox}>
              <span className={css.searchIcon}>
                <IconSearch size={14} />
              </span>
              <input
                className={css.searchInput}
                placeholder="搜索当前文件夹"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </span>
            <button className={css.iconBtn} aria-label="刷新" onClick={refresh}>
              <IconRefresh size={16} />
            </button>
            <div className={css.viewToggle} role="tablist" aria-label="视图切换">
              <button
                className={view === 'list' ? css.viewBtnActive : css.viewBtn}
                aria-label="列表视图"
                onClick={() => setView('list')}
              >
                <IconList size={16} />
              </button>
              <span className={css.viewDivider} />
              <button
                className={view === 'grid' ? css.viewBtnActive : css.viewBtn}
                aria-label="网格视图"
                onClick={() => setView('grid')}
              >
                <IconGrid size={16} />
              </button>
            </div>
          </div>

          {/* 文件表格 / 网格 */}
          {view === 'list' ? (
            <FileTable
              entries={filesQuery.isError ? [] : entries}
              loading={filesQuery.isPending}
              showType
              emptyTitle={
                filesQuery.isError
                  ? '加载失败'
                  : filter
                    ? '没有匹配的条目'
                    : canWrite
                      ? '目录为空'
                      : '目录为空'
              }
              emptyHint={
                filesQuery.isError
                  ? '请稍后重试'
                  : canWrite && !filter
                    ? '点击右上角"上传文件"或"创建文件夹"开始。'
                    : undefined
              }
              onOpenDir={goTo}
              fileHref={(entry) =>
                downloadFileUrl(sourceId, currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`)
              }
              renderActions={(entry) => {
                if (entry.type === 'unsupported') return null
                if (entry.type === 'file') {
                  return (
                    <span className={css.actions}>
                      <a
                        className={css.actionBtn}
                        href={downloadFileUrl(
                          sourceId,
                          currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`下载 ${entry.name}`}
                        title="下载"
                      >
                        <IconDownload size={15} />
                      </a>
                      {canWrite && (
                        <>
                          <button
                            className={css.actionBtn}
                            title="重命名"
                            onClick={() => setRenameTarget({ name: entry.name })}
                          >
                            <IconEdit size={15} />
                          </button>
                          <button
                            className={css.actionBtn}
                            title="移动"
                            onClick={() => setMoveTarget({ name: entry.name })}
                          >
                            <IconMove size={15} />
                          </button>
                          <button
                            className={css.actionBtnDanger}
                            title="删除"
                            onClick={() => setDeleteTarget({ name: entry.name, type: entry.type })}
                          >
                            <IconTrash size={15} />
                          </button>
                        </>
                      )}
                    </span>
                  )
                }
                // dir
                if (!canWrite) return null
                return (
                  <span className={css.actions}>
                    <button
                      className={css.actionBtn}
                      title="重命名"
                      onClick={() => setRenameTarget({ name: entry.name })}
                    >
                      <IconEdit size={15} />
                    </button>
                    <button
                      className={css.actionBtn}
                      title="移动"
                      onClick={() => setMoveTarget({ name: entry.name })}
                    >
                      <IconMove size={15} />
                    </button>
                    <button
                      className={css.actionBtnDanger}
                      title="删除"
                      onClick={() => setDeleteTarget({ name: entry.name, type: entry.type })}
                    >
                      <IconTrash size={15} />
                    </button>
                  </span>
                )
              }}
            />
          ) : (
            <GridView
              entries={entries}
              loading={filesQuery.isPending}
              onOpenDir={goTo}
              onDelete={(name, type) => setDeleteTarget({ name, type })}
              onRename={(name) => setRenameTarget({ name })}
              onMove={(name) => setMoveTarget({ name })}
              canWrite={canWrite}
              filter={filter}
            />
          )}

          {/* 分页 */}
          {total > 0 && (
            <div className={css.pager}>
              <span className={css.pagerInfo}>
                共 {total} 个项目 · 第 {page} / {totalPages} 页
              </span>
              <div className={css.pagerNav}>
                <button
                  className={css.pagerBtn}
                  disabled={page <= 1}
                  onClick={() => goPage(page - 1)}
                  aria-label="上一页"
                >
                  <IconChevronLeft size={14} />
                </button>
                {pageRange(page, totalPages).map((p, i) =>
                  p === '…' ? (
                    <span key={`g${i}`} style={{ padding: '0 6px', color: vars.color.textSecondary }}>…</span>
                  ) : (
                    <button
                      key={p}
                      className={p === page ? css.pagerBtnActive : css.pagerBtn}
                      onClick={() => goPage(p)}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  className={css.pagerBtn}
                  disabled={page >= totalPages}
                  onClick={() => goPage(page + 1)}
                  aria-label="下一页"
                >
                  <IconChevronRight size={14} />
                </button>
                <span className={css.pagerSelect}>
                  <select
                    className={css.pagerSelectNative}
                    value={PAGE_SIZE}
                    onChange={() => {
                      // 切换每页条数回到第 1 页（PAGE_SIZE 当前固定）
                      navigate({
                        to: '/app/sources/$sourceId',
                        params: { sourceId },
                        search: { path: currentPath, page: 1 },
                      })
                    }}
                    aria-label="每页条数"
                  >
                    <option value="20">20 条/页</option>
                    <option value="50">50 条/页</option>
                    <option value="100">100 条/页</option>
                  </select>
                </span>
              </div>
            </div>
          )}
        </div>

        <SourceInfoCard source={source} />

      </div>

      {/* 新建文件夹 */}
      <MkdirDialog
        open={mkdirOpen}
        onOpenChange={setMkdirOpen}
        onCreated={refresh}
        sourceId={sourceId}
        currentPath={currentPath}
      />

      {/* 重命名 */}
      {renameTarget && (
        <RenameDialog
          sourceId={sourceId}
          currentPath={currentPath}
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
          onChanged={refresh}
        />
      )}

      {/* 移动 */}
      {moveTarget && (
        <MoveDialog
          sourceId={sourceId}
          currentPath={currentPath}
          target={moveTarget}
          onClose={() => setMoveTarget(null)}
          onChanged={refresh}
        />
      )}

      {/* 删除 */}
      {deleteTarget && (
        <DeleteDialog
          sourceId={sourceId}
          currentPath={currentPath}
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onChanged={refresh}
        />
      )}
    </AppShell>
  )
}

// --- 面包屑 ---

function Breadcrumb({
  sourceId,
  currentPath,
  upOne,
}: {
  sourceId: string
  currentPath: string
  upOne: () => void
}) {
  const navigate = useNavigate()
  const segs = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean)
  return (
    <nav className={css.crumb} aria-label="面包屑">
      <span className={css.crumbLink} onClick={() => navigate({ to: '/app' })}>
        <IconHome size={14} /> 存储源列表
      </span>
      <span className={css.crumbSep}>/</span>
      <span
        className={segs.length === 0 ? css.crumbCurrent : css.crumbLink}
        onClick={() => segs.length > 0 && upOne()}
      >
        {sourceId}
      </span>
      {segs.map((s, i) => {
        const isLast = i === segs.length - 1
        const upTo = '/' + segs.slice(0, i + 1).join('/')
        return (
          <span key={s + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className={css.crumbSep}>/</span>
            {isLast ? (
              <span className={css.crumbCurrent}>{s}</span>
            ) : (
              <span className={css.crumbLink} onClick={() => navigate({
                to: '/app/sources/$sourceId',
                params: { sourceId },
                search: { path: upTo, page: 1 },
              })}>
                {s}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}

// --- 网格视图（轻量） ---

function GridView({
  entries,
  loading,
  onOpenDir,
  onDelete,
  onRename,
  onMove,
  canWrite,
  filter,
}: {
  entries: FileEntry[]
  loading?: boolean
  onOpenDir: (name: string) => void
  onDelete: (name: string, type: string) => void
  onRename: (name: string) => void
  onMove: (name: string) => void
  canWrite: boolean
  filter: string
}) {
  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: vars.color.textSecondary }}>加载中…</div>
  }
  if (entries.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: vars.color.textSecondary }}>
        {filter ? '没有匹配的条目' : '目录为空'}
      </div>
    )
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 12,
        padding: 12,
        background: vars.color.surface,
        border: `1px solid ${vars.color.border}`,
        borderRadius: vars.radius.lg,
      }}
    >
      {entries.map((e) => (
        <div
          key={e.name}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: 12,
            borderRadius: vars.radius.md,
            cursor: 'pointer',
            transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
          }}
          onDoubleClick={() => e.type === 'dir' && onOpenDir(e.name)}
        >
          <div
            onClick={() => e.type === 'dir' && onOpenDir(e.name)}
            style={{ width: 64, height: 64, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {/* 通过名称展示类型图标 */}
            {e.type === 'dir' ? <IconCloud size={48} style={{ color: 'oklch(0.72 0.13 75)' }} /> : (
              <div style={{ fontSize: 11, color: vars.color.textSecondary }}>{e.name}</div>
            )}
          </div>
          <span style={{ fontSize: vars.fontSize.sm, textAlign: 'center', wordBreak: 'break-all' }}>{e.name}</span>
          {canWrite && e.type !== 'unsupported' && (
            <span style={{ display: 'flex', gap: 4 }}>
              {e.type === 'file' && <span style={{ width: 12 }} />}
              <button className={css.actionBtn} title="重命名" onClick={() => onRename(e.name)}>
                <IconEdit size={12} />
              </button>
              <button className={css.actionBtn} title="移动" onClick={() => onMove(e.name)}>
                <IconMove size={12} />
              </button>
              <button
                className={css.actionBtnDanger}
                title="删除"
                onClick={() => onDelete(e.name, e.type)}
              >
                <IconTrash size={12} />
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// --- 右栏：存储源信息卡 ---

function SourceInfoCard({ source }: { source: UserSource }) {
  return (
    <aside className={css.sideCol}>
      <section className={css.sidePanel}>
        <header className={css.sidePanelHeader}>存储源信息</header>
        <div className={css.sidePanelBody}>
          <Row label="存储源名称" value={source.name} />
          <Row label="Source ID" value={source.source_id} mono />
          <Row label="真实路径" value="（仅管理员可见）" muted />
          <Row
            label="公开挂载路径"
            value={source.public_read_enabled && source.public_mount_path ? source.public_mount_path : '—'}
            mono
          />
          <Row
            label="状态"
            value={source.public_read_enabled ? '已公开' : '未公开'}
            badge={source.public_read_enabled ? 'green' : 'gray'}
          />
          {source.webdav_enabled && (
            <div>
              <span className={css.sideKvLabel}>WebDAV</span>
              <a className={css.sideLink} href="/dav" target="_blank" rel="noreferrer">
                <IconLink size={12} /> /dav
                <IconExternalLink size={12} />
              </a>
            </div>
          )}
          {source.image_bed_enabled && (
            <Row label="图床服务" value="已启用" badge="purple" />
          )}
        </div>
      </section>
    </aside>
  )
}

function Row({
  label,
  value,
  mono,
  muted,
  badge,
}: {
  label: string
  value: string
  mono?: boolean
  muted?: boolean
  badge?: 'green' | 'gray' | 'blue' | 'purple' | 'red'
}) {
  return (
    <div className={css.sideKvRow}>
      <span className={css.sideKvLabel}>{label}</span>
      {badge ? (
        <Badge color={badge}>{value}</Badge>
      ) : (
        <span
          className={css.sideKvValue}
          style={{
            fontFamily: mono ? vars.font.mono : 'inherit',
            color: muted ? vars.color.textSecondary : vars.color.text,
          }}
        >
          {value}
        </span>
      )}
    </div>
  )
}

// --- 空状态 ---

function NoSourceView() {
  const navigate = useNavigate()
  return (
    <>
      <div className={css.pageHeader}>
        <h1 className={css.pageTitle}>文件管理</h1>
        <div className={css.headerActions} style={{ marginLeft: 'auto' }}>
          <Button onClick={() => navigate({ to: '/app' })}>
            切换存储源
          </Button>
          <Button variant="secondary" disabled title="暂无可用存储源">
            <IconUpload size={14} /> 上传文件
          </Button>
          <Button variant="secondary" disabled title="暂无可用存储源">
            <IconFolderPlus size={14} /> 创建文件夹
          </Button>
          <Button variant="secondary" onClick={() => navigate({ to: '/app' })}>
            返回存储源列表
          </Button>
        </div>
      </div>
      <div className={css.emptyShell}>
        <div className={css.emptyMain}>
          <div className={css.emptyIllustration}>
            <NoSourceIllustration />
          </div>
          <h2 className={css.emptyTitle}>你还没有被分配存储源</h2>
          <p className={css.emptyHint}>
            请联系系统管理员为你分配存储源，或切换到已有访问权限的存储源。
          </p>
          <div className={css.emptyActions}>
            <Button onClick={() => navigate({ to: '/app' })}>切换存储源</Button>
            <Button
              variant="secondary"
              onClick={() => window.open('https://github.com/omni-store/omni-store', '_blank')}
            >
              <IconQuestion size={14} /> 了解更多
            </Button>
          </div>
        </div>

        <aside className={css.sideCol}>
          <section className={css.sidePanel}>
            <header className={css.sidePanelHeader}>存储源信息</header>
            <div className={css.sidePanelBody}>
              <div className={css.emptySideTitle}>
                <div className={css.emptySideIcon}>
                  <NoSourceSmallIllustration />
                </div>
              </div>
              <div className={css.emptySideName}>暂无可用存储源</div>
              <p className={css.emptySideDesc}>
                你当前还没有被分配任何存储源，无法查看或管理文件。
              </p>
              <div className={css.emptySideList}>
                <span className={css.emptySideListTitle}>你可以</span>
                <span className={css.emptySideItem}>
                  <IconCopy size={14} style={{ color: vars.color.textSecondary }} />
                  联系管理员为你分配存储源
                </span>
                <span className={css.emptySideItem}>
                  <IconCopy size={14} style={{ color: vars.color.textSecondary }} />
                  切换到已有访问权限的存储源
                </span>
                <span className={css.emptySideItem}>
                  <IconCopy size={14} style={{ color: vars.color.textSecondary }} />
                  了解更多产品功能和使用方法
                </span>
              </div>
              <a className={css.helpLink} href="https://github.com/omni-store/omni-store" target="_blank" rel="noreferrer">
                <IconExternalLink size={14} /> 查看帮助文档
              </a>
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}

// --- 弹窗：新建 / 重命名 / 移动 / 删除 ---

function MkdirDialog({
  open,
  onOpenChange,
  onCreated,
  sourceId,
  currentPath,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
  sourceId: string
  currentPath: string
}) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) { setName(''); setErr('') }
  }, [open])

  const mut = useMutation({
    mutationFn: () => createFolder(sourceId, currentPath, name.trim()),
    onSuccess: () => { onOpenChange(false); onCreated() },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '创建失败'),
  })

  function submit() {
    setErr('')
    if (!name.trim()) { setErr('请输入目录名'); return }
    if (/[\\/:*?"<>|]/.test(name)) { setErr('目录名不能包含 / \\ : * ? " < > |'); return }
    mut.mutate()
  }

  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title="新建文件夹"
      description={`在 ${currentPath} 下创建一个新目录。`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={submit} disabled={mut.isPending || !name.trim()}>
            {mut.isPending ? '创建中…' : '创建'}
          </Button>
        </>
      }
    >
      <Field label="目录名" required error={err}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：旅行" />
      </Field>
    </DialogWrap>
  )
}

function RenameDialog({
  sourceId,
  currentPath,
  target,
  onClose,
  onChanged,
}: {
  sourceId: string
  currentPath: string
  target: { name: string }
  onClose: () => void
  onChanged: () => void
}) {
  const [name, setName] = useState(target.name)
  const [err, setErr] = useState('')
  useEffect(() => { setName(target.name); setErr('') }, [target.name])

  const fullPath = currentPath === '/' ? `/${target.name}` : `${currentPath}/${target.name}`
  const mut = useMutation({
    mutationFn: () => renameFile(sourceId, fullPath, name.trim()),
    onSuccess: () => { onClose(); onChanged() },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '重命名失败'),
  })

  function submit() {
    setErr('')
    if (!name.trim()) { setErr('请输入名称'); return }
    if (name.trim() === target.name) { onClose(); return }
    if (/[\\/:*?"<>|]/.test(name)) { setErr('名称不能包含 / \\ : * ? " < > |'); return }
    mut.mutate()
  }

  return (
    <DialogWrap
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      title="重命名"
      description={fullPath}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={submit} disabled={mut.isPending || !name.trim()}>
            {mut.isPending ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <Field label="新名称" required error={err}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
    </DialogWrap>
  )
}

function MoveDialog({
  sourceId,
  currentPath,
  target,
  onClose,
  onChanged,
}: {
  sourceId: string
  currentPath: string
  target: { name: string }
  onClose: () => void
  onChanged: () => void
}) {
  const fromPath = currentPath === '/' ? `/${target.name}` : `${currentPath}/${target.name}`
  const [toPath, setToPath] = useState(fromPath)
  const [err, setErr] = useState('')
  useEffect(() => { setToPath(fromPath); setErr('') }, [fromPath])

  const mut = useMutation({
    mutationFn: () => moveFile(sourceId, fromPath, toPath.trim()),
    onSuccess: () => { onClose(); onChanged() },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '移动失败'),
  })

  function submit() {
    setErr('')
    if (!toPath.trim() || toPath.trim() === fromPath) { onClose(); return }
    if (!toPath.startsWith('/')) { setErr('目标路径必须是绝对路径（以 / 开头）'); return }
    mut.mutate()
  }

  return (
    <DialogWrap
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      title="移动"
      description="在当前存储源内移动条目，目标路径必须是绝对路径。"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={submit} disabled={mut.isPending || !toPath.trim()}>
            {mut.isPending ? '移动中…' : '移动'}
          </Button>
        </>
      }
    >
      <Field label="原路径">
        <Input readOnly value={fromPath} />
      </Field>
      <Field label="目标路径" required error={err} hint="例如：/photos/2026">
        <Input autoFocus value={toPath} onChange={(e) => setToPath(e.target.value)} />
      </Field>
    </DialogWrap>
  )
}

function DeleteDialog({
  sourceId,
  currentPath,
  target,
  onClose,
  onChanged,
}: {
  sourceId: string
  currentPath: string
  target: { name: string; type: string }
  onClose: () => void
  onChanged: () => void
}) {
  const fullPath = currentPath === '/' ? `/${target.name}` : `${currentPath}/${target.name}`
  const isDir = target.type === 'dir'
  const mut = useMutation({
    mutationFn: () => deleteFile(sourceId, fullPath),
    onSuccess: () => { onClose(); onChanged() },
    onError: (e) => alert(e instanceof ApiRequestError ? e.message : '删除失败'),
  })

  return (
    <DialogWrap
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      title={isDir ? '删除目录' : '删除文件'}
      description={fullPath}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="danger" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? '删除中…' : '确认删除'}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: vars.fontSize.sm, color: vars.color.text }}>
        {isDir
          ? `确定要删除目录「${target.name}」吗？目录内所有内容都会被永久删除，此操作不可恢复。`
          : `确定要永久删除「${target.name}」吗？此操作不可恢复。`}
      </p>
    </DialogWrap>
  )
}

// --- 工具 ---

function pageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}

// --- 空状态插画（行内 SVG，避免外部依赖） ---

function NoSourceIllustration() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" fill="none" aria-hidden="true">
      <ellipse cx="90" cy="156" rx="58" ry="6" fill="oklch(0.92 0.01 240)" />
      <rect x="56" y="56" width="68" height="80" rx="6" fill="oklch(0.95 0.04 230)" stroke="oklch(0.75 0.1 230)" strokeWidth="2" />
      <rect x="56" y="56" width="68" height="14" rx="6" fill="oklch(0.88 0.08 230)" />
      <rect x="68" y="84" width="44" height="6" rx="3" fill="oklch(0.86 0.06 230)" />
      <rect x="68" y="98" width="36" height="6" rx="3" fill="oklch(0.86 0.06 230)" />
      <rect x="68" y="112" width="28" height="6" rx="3" fill="oklch(0.86 0.06 230)" />
      <circle cx="120" cy="50" r="16" fill="oklch(0.93 0.06 230)" stroke="oklch(0.75 0.1 230)" strokeWidth="2" />
      <text x="120" y="56" textAnchor="middle" fontSize="20" fontWeight="700" fill="oklch(0.55 0.15 230)">?</text>
      <path d="M30 110 q-12 -8 -4 -20" stroke="oklch(0.85 0.06 230)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M150 110 q12 -8 4 -20" stroke="oklch(0.85 0.06 230)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function NoSourceSmallIllustration() {
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <ellipse cx="50" cy="86" rx="32" ry="4" fill="oklch(0.92 0.01 240)" />
      <rect x="28" y="30" width="44" height="46" rx="4" fill="oklch(0.95 0.04 230)" stroke="oklch(0.75 0.1 230)" strokeWidth="1.5" />
      <rect x="28" y="30" width="44" height="8" rx="4" fill="oklch(0.88 0.08 230)" />
      <path d="M70 30 l8 -10 l8 10" fill="oklch(0.93 0.06 230)" stroke="oklch(0.75 0.1 230)" strokeWidth="1.5" />
      <circle cx="80" cy="24" r="8" fill="oklch(0.93 0.06 230)" stroke="oklch(0.75 0.1 230)" strokeWidth="1.5" />
      <text x="80" y="28" textAnchor="middle" fontSize="12" fontWeight="700" fill="oklch(0.55 0.15 230)">?</text>
    </svg>
  )
}
