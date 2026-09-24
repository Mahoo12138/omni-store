import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  copyFile,
  createFolder,
  deleteFile,
  downloadFileUrl,
  fetchMySources,
  fetchPathPermission,
  fetchSourceQuota,
  listFiles,
  moveFile,
  renameFile,
  uploadFile,
  type FileEntry,
  type StorageQuota,
  type UserSource,
} from '../api/sources'
import { ApiRequestError } from '../api/client'
import { createShare, type FileShare } from '../api/shares'
import { fetchMyQuota, type UserQuota } from '../api/auth'
import { AppShell } from '../components/layout/AppShell'
import { useFileClipboard, type FileClipboardItem, type FileClipboardOperation } from '../components/files/FileClipboard'
import { FileTable } from '../components/files/FileTable'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { DialogWrap } from '../components/ui/Dialog'
import { Field } from '../components/ui/Field'
import { Input } from '../components/ui/Input'
import { Menu, type MenuOption } from '../components/ui/Menu'
import { Select } from '../components/ui/Select'
import { appStatusToastID, toast, toastError, toastInfo, toastSuccess } from '../components/ui/Toast'
import { Tooltip } from '../components/ui/Tooltip'
import {
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconClipboard,
  IconCloud,
  IconCopy,
  IconChevronDown,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconFolderPlus,
  IconGrid,
  IconHome,
  IconLink,
  IconList,
  IconMore,
  IconQuestion,
  IconRefresh,
  IconSearch,
  IconScissors,
  IconTrash,
  IconUpload,
} from '../components/ui/Icon'
import { vars } from '../styles/theme.css'
import { formatBytes } from '../utils/format'
import { readFilePreferences, writeFilePreferences, type FileSortKey, type FileSortOrder } from '../utils/filePreferences'
import {
  UploadTaskController,
  uploadRelativePath,
  type UploadTaskItem,
  type UploadTaskSnapshot,
  type UploadConflictDecision,
} from '../utils/uploadTask'
import * as css from './FileManager.css'

type PasteTaskSnapshot = {
  status: 'running' | 'completed' | 'completed_with_errors'
  operation: 'copy' | 'cut'
  total: number
  completed: number
  failed: number
  current: string
  targetPath: string
  errors: string[]
}

type BatchDeleteTaskSnapshot = {
  status: 'running' | 'completed' | 'completed_with_errors'
  total: number
  completed: number
  failed: number
  current: string
  errors: string[]
}

// /app/sources/$sourceKey（docs/file.png / file-1.png）：
//   - 有存储源：标题 / 按钮 + 面包屑 / 工具条 / 表格 / 分页 + 右侧存储源信息卡
//   - 没有可用存储源：空状态 + 右侧"暂无可用存储源"卡
export function FileManagerPage() {
  const { sourceKey } = useParams({ from: '/app/sources/$sourceKey' })
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const source = sources.data?.find((s) => s.key === sourceKey)

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

  // 3) URL 里指定的 sourceKey 不可用
  if (sources.isSuccess && !source) {
    return (
      <AppShell title="文件管理">
        <NoSourceView />
      </AppShell>
    )
  }

  // 4) 正常文件管理视图
  if (!source) return null
  return <FileManagerView key={source.key} source={source} sources={sources.data ?? []} />
}

// --- 主视图 ---

function FileManagerView({ source, sources }: { source: UserSource; sources: UserSource[] }) {
  const sourceKey = source.key
  const clipboard = useFileClipboard()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ from: '/app/sources/$sourceKey' })
  const currentPath = search.path || '/'
  const page = search.page ?? 1

  const fileInput = useRef<HTMLInputElement>(null)
  const folderUploadMode = useRef(false)
  const uploadController = useRef<UploadTaskController | null>(null)
  const [filter, setFilter] = useState('')
  const [preferences, setPreferences] = useState(() => readFilePreferences(sourceKey))
  const { view, pageSize, sort, order } = preferences
  const [uploadTask, setUploadTask] = useState<UploadTaskSnapshot | null>(null)
  const [pasteTask, setPasteTask] = useState<PasteTaskSnapshot | null>(null)
  const [batchDeleteTask, setBatchDeleteTask] = useState<BatchDeleteTaskSnapshot | null>(null)
  const closePasteTask = useCallback(() => setPasteTask(null), [])

  // 各种操作弹窗
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; type: string } | null>(null)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<{ name: string; type: 'file' | 'dir' } | null>(null)
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false)
  const [uploadConflict, setUploadConflict] = useState<{
    item: UploadTaskItem
    resolve: (decision: UploadConflictDecision) => void
  } | null>(null)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())

  const permissionQuery = useQuery({
    queryKey: ['source-permission', sourceKey, currentPath],
    queryFn: () => fetchPathPermission(sourceKey, currentPath),
  })
  const currentPermission = permissionQuery.data?.permission ?? 'read_only'
  const canWrite = currentPermission === 'read_write'
  const quotaQuery = useQuery({
    queryKey: ['source-quota', sourceKey],
    queryFn: () => fetchSourceQuota(sourceKey),
  })
  const userQuotaQuery = useQuery({ queryKey: ['my-quota'], queryFn: fetchMyQuota })

  useEffect(() => {
    return () => uploadController.current?.cancel()
  }, [])

  useEffect(() => {
    writeFilePreferences(sourceKey, preferences)
  }, [sourceKey, preferences])

  const filesQuery = useQuery({
    queryKey: ['files', sourceKey, currentPath, page, pageSize, sort, order],
    queryFn: () => listFiles(sourceKey, { path: currentPath, page, pageSize, sort, order }),
  })

  const total = filesQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    setSelectedNames(new Set())
  }, [sourceKey, currentPath, page, pageSize, sort, order])

  function updatePreferences(next: Partial<typeof preferences>) {
    setPreferences((current) => ({ ...current, ...next }))
    setSelectedNames(new Set())
  }

  function changeSort(value: string) {
    const [nextSort, nextOrder] = value.split(':') as [FileSortKey, FileSortOrder]
    updatePreferences({ sort: nextSort, order: nextOrder })
    navigate({ to: '/app/sources/$sourceKey', params: { sourceKey }, search: { path: currentPath, page: 1 } })
  }

  function refresh(changedSourceKeys: string[] = [sourceKey]) {
    for (const changedSourceKey of new Set(changedSourceKeys)) {
      queryClient.invalidateQueries({ queryKey: ['files', changedSourceKey] })
      queryClient.invalidateQueries({ queryKey: ['source-quota', changedSourceKey] })
    }
    queryClient.invalidateQueries({ queryKey: ['my-quota'] })
  }

  function goTo(seg: string) {
    setFilter('')
    const abs = currentPath === '/' ? `/${seg}` : `${currentPath}/${seg}`
    navigate({ to: '/app/sources/$sourceKey', params: { sourceKey }, search: { path: abs, page: 1 } })
  }

  function upOne() {
    const parent = currentPath.replace(/\/[^/]+$/, '') || '/'
    navigate({ to: '/app/sources/$sourceKey', params: { sourceKey }, search: { path: parent, page: 1 } })
  }

  function goPage(p: number) {
    navigate({
      to: '/app/sources/$sourceKey',
      params: { sourceKey },
      search: { path: currentPath, page: p },
    })
  }

  function toggleSelected(name: string, selected: boolean) {
    setSelectedNames((current) => {
      const next = new Set(current)
      if (selected) next.add(name)
      else next.delete(name)
      return next
    })
  }

  function toggleAllSelected(selected: boolean) {
    setSelectedNames((current) => {
      const next = new Set(current)
      for (const entry of selectableEntries) {
        if (selected) next.add(entry.name)
        else next.delete(entry.name)
      }
      return next
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
  const selectableEntries = entries.filter((entry) => entry.type !== 'unsupported')
  const selectedEntries = entries.filter((entry) => selectedNames.has(entry.name) && entry.type !== 'unsupported')
  const allVisibleSelected = selectableEntries.length > 0 && selectableEntries.every((entry) => selectedNames.has(entry.name))
  const runningFileTask = uploadTask?.status === 'running'
    ? '正在上传，请稍候…'
    : pasteTask?.status === 'running'
      ? '正在粘贴，请稍候…'
      : batchDeleteTask?.status === 'running'
        ? '正在批量删除，请稍候…'
        : ''
  const pasteDisabledReason = runningFileTask || getPasteDisabledReason(clipboard.items, clipboard.operation, sourceKey, currentPath, canWrite)

  const onError = (err: unknown) => {
    toastError(err instanceof ApiRequestError ? err.message : '操作失败，请重试。')
  }

  function startUpload(files: FileList | File[] | null, kind: 'file' | 'files' | 'directory') {
    if (!files?.length) return
    const controller = new UploadTaskController({
      sourceKey,
      targetPath: currentPath,
      files: Array.from(files),
      kind,
      conflictPolicy: 'ask',
      concurrency: 4,
      uploader: (item, options) =>
        uploadFile(sourceKey, currentPath, item.file, {
          relativePath: item.relativePath,
          overwrite: options.overwrite,
          signal: options.signal,
        }),
      resolveConflict: (item) => new Promise<UploadConflictDecision>((resolve) => {
        setUploadConflict({ item, resolve })
      }),
      onChange: setUploadTask,
    })
    uploadController.current = controller
    void controller.start().then(() => {
      refresh()
    }).catch(onError)
    if (fileInput.current) fileInput.current.value = ''
    fileInput.current?.removeAttribute('webkitdirectory')
    fileInput.current?.removeAttribute('directory')
    folderUploadMode.current = false
  }

  function openFilePicker() {
    folderUploadMode.current = false
    fileInput.current?.removeAttribute('webkitdirectory')
    fileInput.current?.removeAttribute('directory')
    fileInput.current?.click()
  }

  function openFolderPicker() {
    setDirectoryPickerOpen(true)
  }

  function clipboardItem(entry: FileEntry): FileClipboardItem {
    const path = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`
    return {
      id: `${sourceKey}:${path}`,
      sourceKey,
      sourceName: source.name,
      path,
      name: entry.name,
      type: entry.type === 'dir' ? 'dir' : 'file',
    }
  }

  function copyEntries(entriesToCopy: FileEntry[]) {
    const items = entriesToCopy.filter((entry) => entry.type !== 'unsupported').map(clipboardItem)
    if (items.length === 0) return
    clipboard.copy(items)
    setSelectedNames(new Set())
    toastSuccess(`已复制 ${items.length} 项到剪贴板。`)
  }

  function cutEntries(entriesToCut: FileEntry[]) {
    const items = entriesToCut.filter((entry) => entry.type !== 'unsupported').map(clipboardItem)
    if (items.length === 0) return
    clipboard.cut(items)
    setSelectedNames(new Set())
    toastSuccess(`已剪切 ${items.length} 项到剪贴板。`)
  }

  async function pasteClipboard() {
    const items = clipboard.items
    const operation = clipboard.operation
    const targetPath = currentPath
    if (!operation || items.length === 0 || pasteDisabledReason || pasteTask?.status === 'running') return

    let completed = 0
    let failed = 0
    const errors: string[] = []
    const failedItems: FileClipboardItem[] = []
    setPasteTask({
      status: 'running',
      operation,
      total: items.length,
      completed,
      failed,
      current: items[0]?.name ?? '',
      targetPath,
      errors: [],
    })

    for (const item of items) {
      setPasteTask({ status: 'running', operation, total: items.length, completed, failed, current: item.name, targetPath, errors: [...errors] })
      const destinationPath = joinPath(targetPath, item.name)
      try {
        if (operation === 'copy') await copyFile(item.sourceKey, item.path, sourceKey, destinationPath)
        else await moveFile(item.sourceKey, item.path, sourceKey, destinationPath)
        completed += 1
      } catch (error) {
        failed += 1
        failedItems.push(item)
        errors.push(`${item.name}：${error instanceof ApiRequestError ? error.message : '粘贴失败'}`)
      }
      setPasteTask({ status: 'running', operation, total: items.length, completed, failed, current: item.name, targetPath, errors: [...errors] })
    }

    setPasteTask({
      status: failed > 0 ? 'completed_with_errors' : 'completed',
      operation,
      total: items.length,
      completed,
      failed,
      current: '',
      targetPath,
      errors: [...errors],
    })
    refresh([sourceKey, ...items.map((item) => item.sourceKey)])
    if (operation === 'cut') {
      if (failed === 0) clipboard.clear()
      else clipboard.cut(failedItems)
    } else if (failed > 0) {
      clipboard.copy(failedItems)
    }
  }

  async function deleteSelectedEntries() {
    if (!canWrite || selectedEntries.length === 0 || batchDeleteTask?.status === 'running') return
    const targets = [...selectedEntries]
    setBatchDeleteOpen(false)
    setBatchDeleteTask({ status: 'running', total: targets.length, completed: 0, failed: 0, current: targets[0].name, errors: [] })

    let completed = 0
    let failed = 0
    const failedNames: string[] = []
    const errors: string[] = []
    for (const entry of targets) {
      setBatchDeleteTask({ status: 'running', total: targets.length, completed, failed, current: entry.name, errors: [...errors] })
      try {
        await deleteFile(sourceKey, joinPath(currentPath, entry.name))
        completed += 1
      } catch (error) {
        failed += 1
        failedNames.push(entry.name)
        errors.push(`${entry.name}：${error instanceof ApiRequestError ? error.message : '移入回收站失败'}`)
      }
      setBatchDeleteTask({ status: 'running', total: targets.length, completed, failed, current: entry.name, errors: [...errors] })
    }

    setSelectedNames(new Set(failedNames))
    refresh()
    setBatchDeleteTask({
      status: failed > 0 ? 'completed_with_errors' : 'completed',
      total: targets.length,
      completed,
      failed,
      current: '',
      errors,
    })
  }

  function openLegacyFolderPicker() {
    folderUploadMode.current = true
    fileInput.current?.setAttribute('webkitdirectory', '')
    fileInput.current?.setAttribute('directory', '')
    fileInput.current?.click()
  }

  async function chooseDirectory() {
    setDirectoryPickerOpen(false)
    if (!hasDirectoryPicker()) {
      openLegacyFolderPicker()
      return
    }

    try {
      const directoryHandle = await getDirectoryPickerWindow().showDirectoryPicker?.({ mode: 'read' })
      if (!directoryHandle) return
      const files = await readDirectoryFiles(directoryHandle)
      if (files.length === 0) {
        toastInfo('所选目录中没有可上传的文件。')
        return
      }
      startUpload(files, 'directory')
    } catch (error) {
      if (isAbortError(error)) return
      onError(error)
    }
  }

  useEffect(() => {
    function handleClipboardShortcut(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return

      const key = event.key.toLowerCase()
      if (key === 'c' && selectedEntries.length > 0) {
        event.preventDefault()
        copyEntries(selectedEntries)
      } else if (key === 'x' && canWrite && selectedEntries.length > 0) {
        event.preventDefault()
        cutEntries(selectedEntries)
      } else if (key === 'v' && clipboard.items.length > 0 && !pasteDisabledReason && pasteTask?.status !== 'running') {
        event.preventDefault()
        void pasteClipboard()
      }
    }

    window.addEventListener('keydown', handleClipboardShortcut)
    return () => window.removeEventListener('keydown', handleClipboardShortcut)
  }, [canWrite, clipboard.items, pasteDisabledReason, pasteTask?.status, selectedEntries])

  return (
    <AppShell title={source.name}>
      {/* 页面头：只保留当前任务、能力与主要操作，技术信息放在右栏。 */}
      <div className={css.pageHeader}>
        <div className={css.headerIntro}>
          <h1 className={css.pageTitle}>{source.name}</h1>
          <p className={css.pageDescription}>{source.description || '管理此存储源中的文件。'}</p>
        </div>

        <div className={css.headerActions}>
          <Button
            variant="secondary"
            onClick={() => navigate({ to: '/app/sources/$sourceKey/trash', params: { sourceKey } })}
          >
            <IconTrash size={14} /> 回收站
          </Button>
          {canWrite && (
            <>
              <Button onClick={openFilePicker} disabled={Boolean(runningFileTask)}>
                <IconUpload size={14} /> 上传文件
              </Button>
              <Button variant="secondary" onClick={openFolderPicker} disabled={Boolean(runningFileTask)}>
                <IconFolderPlus size={14} /> 上传目录
              </Button>
              <Button variant="secondary" onClick={() => setMkdirOpen(true)} disabled={Boolean(runningFileTask)}>
                <IconFolderPlus size={14} /> 创建文件夹
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                disabled={Boolean(runningFileTask)}
                onChange={(e) => startUpload(
                  e.target.files,
                  folderUploadMode.current ? 'directory' : e.target.files?.length === 1 ? 'file' : 'files',
                )}
              />
            </>
          )}
        </div>
      </div>

      {uploadTask && (
        <UploadTaskToastHost
          task={uploadTask}
          onCancel={() => uploadController.current?.cancel()}
          onRetry={() => void uploadController.current?.retryFailed()}
          onClose={() => {
            if (uploadTask.status !== 'running') {
              uploadController.current = null
              setUploadTask(null)
            }
          }}
        />
      )}

      {pasteTask && (
        <PasteTaskToastHost
          task={pasteTask}
          onClose={closePasteTask}
        />
      )}

      {batchDeleteTask && (
        <BatchDeleteTaskToastHost
          task={batchDeleteTask}
          onClose={() => setBatchDeleteTask(null)}
        />
      )}

      <div className={css.layout}>
        <div className={css.main}>
          {/* 面包屑：存储源列表 / 源名 / 子路径 */}
          <Breadcrumb
            sourceKey={sourceKey}
            sourceName={source.name}
            sources={sources}
            currentPath={currentPath}
            upOne={upOne}
          />

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
            <Select
              value={`${sort}:${order}`}
              onValueChange={changeSort}
              options={[
                { value: 'name:asc', label: '名称升序' },
                { value: 'name:desc', label: '名称降序' },
                { value: 'size:asc', label: '大小升序' },
                { value: 'size:desc', label: '大小降序' },
                { value: 'mtime:asc', label: '修改时间升序' },
                { value: 'mtime:desc', label: '修改时间降序' },
              ]}
              ariaLabel="排序方式"
              size="compact"
              width="content"
            />
            <button className={css.iconBtn} aria-label="刷新" onClick={() => refresh()}>
              <IconRefresh size={16} />
            </button>
            <div className={css.viewToggle} role="tablist" aria-label="视图切换">
              <button
                className={view === 'list' ? css.viewBtnActive : css.viewBtn}
                aria-label="列表视图"
                aria-selected={view === 'list'}
                role="tab"
                onClick={() => updatePreferences({ view: 'list' })}
              >
                <IconList size={16} />
              </button>
              <span className={css.viewDivider} />
              <button
                className={view === 'grid' ? css.viewBtnActive : css.viewBtn}
                aria-label="网格视图"
                aria-selected={view === 'grid'}
                role="tab"
                onClick={() => updatePreferences({ view: 'grid' })}
              >
                <IconGrid size={16} />
              </button>
            </div>
          </div>

          {selectedEntries.length > 0 ? (
            <SelectionToolbar
              count={selectedEntries.length}
              canCut={canWrite}
              canDelete={canWrite && !runningFileTask}
              onCopy={() => copyEntries(selectedEntries)}
              onCut={() => cutEntries(selectedEntries)}
              onDelete={() => setBatchDeleteOpen(true)}
              onClear={() => setSelectedNames(new Set())}
            />
          ) : clipboard.items.length > 0 ? (
            <ClipboardBar
              operation={clipboard.operation!}
              items={clipboard.items}
              canPaste={!pasteDisabledReason && pasteTask?.status !== 'running'}
              disabledReason={pasteDisabledReason}
              onPaste={() => void pasteClipboard()}
              onClear={clipboard.clear}
            />
          ) : null}

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
              selectable
              selectedNames={selectedNames}
              allSelected={allVisibleSelected}
              onToggleSelected={toggleSelected}
              onToggleAll={toggleAllSelected}
              fileHref={(entry) =>
                downloadFileUrl(sourceKey, currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`)
              }
              renderActions={(entry) => {
                if (entry.type === 'unsupported') return null
                if (entry.type === 'file') {
                  return (
                    <span className={css.actions}>
                      <a
                        className={css.actionBtn}
                        href={downloadFileUrl(
                          sourceKey,
                          currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`,
                        )}
                        aria-label={`下载 ${entry.name}`}
                        title="下载"
                      >
                        <IconDownload size={15} />
                      </a>
                      <button
                        className={css.actionBtn}
                        title="复制"
                        onClick={() => copyEntries([entry])}
                      >
                        <IconCopy size={15} />
                      </button>
                      {canWrite && (
                        <EntryActionsMenu
                          entryName={entry.name}
                          items={[
                            {
                              id: 'share',
                              label: '创建分享',
                              icon: <IconLink size={15} />,
                              onSelect: () => setShareTarget({ name: entry.name, type: 'file' }),
                            },
                            {
                              id: 'rename',
                              label: '重命名',
                              icon: <IconEdit size={15} />,
                              onSelect: () => setRenameTarget({ name: entry.name }),
                            },
                            {
                              id: 'cut',
                              label: '剪切',
                              icon: <IconScissors size={15} />,
                              onSelect: () => cutEntries([entry]),
                            },
                            {
                              id: 'delete',
                              label: '删除',
                              icon: <IconTrash size={15} />,
                              danger: true,
                              onSelect: () => setDeleteTarget({ name: entry.name, type: entry.type }),
                            },
                          ]}
                        />
                      )}
                    </span>
                  )
                }
                // dir
                return (
                  <span className={css.actions}>
                    <button
                      className={css.actionBtn}
                      title="复制"
                      onClick={() => copyEntries([entry])}
                    >
                      <IconCopy size={15} />
                    </button>
                    {canWrite && (
                      <>
                        <button
                          className={css.actionBtn}
                          title="创建分享"
                          onClick={() => setShareTarget({ name: entry.name, type: 'dir' })}
                        >
                          <IconLink size={15} />
                        </button>
                        <EntryActionsMenu
                          entryName={entry.name}
                          items={[
                            {
                              id: 'rename',
                              label: '重命名',
                              icon: <IconEdit size={15} />,
                              onSelect: () => setRenameTarget({ name: entry.name }),
                            },
                            {
                              id: 'cut',
                              label: '剪切',
                              icon: <IconScissors size={15} />,
                              onSelect: () => cutEntries([entry]),
                            },
                            {
                              id: 'delete',
                              label: '删除',
                              icon: <IconTrash size={15} />,
                              danger: true,
                              onSelect: () => setDeleteTarget({ name: entry.name, type: entry.type }),
                            },
                          ]}
                        />
                      </>
                    )}
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
              onCopy={(name) => {
                const entry = entries.find((item) => item.name === name)
                if (entry) copyEntries([entry])
              }}
              onCut={(name) => {
                const entry = entries.find((item) => item.name === name)
                if (entry) cutEntries([entry])
              }}
              onShare={(name, type) => setShareTarget({ name, type })}
              canWrite={canWrite}
              filter={filter}
              selectedNames={selectedNames}
              onToggleSelected={toggleSelected}
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
                <Select
                  value={String(pageSize)}
                  onValueChange={(nextPageSize) => {
                    updatePreferences({ pageSize: Number(nextPageSize) as 20 | 50 | 100 })
                    navigate({
                      to: '/app/sources/$sourceKey',
                      params: { sourceKey },
                      search: { path: currentPath, page: 1 },
                    })
                  }}
                  options={[
                    { value: '20', label: '20 条/页' },
                    { value: '50', label: '50 条/页' },
                    { value: '100', label: '100 条/页' },
                  ]}
                  ariaLabel="每页条数"
                  size="compact"
                  width="content"
                />
              </div>
            </div>
          )}
        </div>

        <SourceInfoCard
          source={source}
          currentPermission={currentPermission}
          quota={quotaQuery.data}
          userQuota={userQuotaQuery.data}
        />

      </div>

      {/* 新建文件夹 */}
      <MkdirDialog
        open={mkdirOpen}
        onOpenChange={setMkdirOpen}
        onCreated={refresh}
        sourceKey={sourceKey}
        currentPath={currentPath}
      />

      <DirectoryUploadDialog
        open={directoryPickerOpen}
        onOpenChange={setDirectoryPickerOpen}
        supportsDirectoryPicker={hasDirectoryPicker()}
        onChoose={() => void chooseDirectory()}
      />

      {uploadConflict && (
        <UploadConflictDialog
          item={uploadConflict.item}
          onDecision={(decision) => {
            const pending = uploadConflict
            setUploadConflict(null)
            pending.resolve(decision)
          }}
        />
      )}

      {/* 重命名 */}
      {renameTarget && (
        <RenameDialog
          sourceKey={sourceKey}
          currentPath={currentPath}
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
          onChanged={refresh}
        />
      )}

      {/* 创建分享 */}
      {shareTarget && (
        <ShareDialog
          sourceKey={sourceKey}
          currentPath={currentPath}
          target={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}

      {/* 删除 */}
      {deleteTarget && (
        <DeleteDialog
          sourceKey={sourceKey}
          currentPath={currentPath}
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onChanged={() => {
            refresh()
            toastSuccess(`已将 ${deleteTarget.name} 移入回收站。`)
          }}
          onError={onError}
        />
      )}

      {batchDeleteOpen && (
        <BatchDeleteDialog
          entries={selectedEntries}
          onClose={() => setBatchDeleteOpen(false)}
          onConfirm={() => void deleteSelectedEntries()}
        />
      )}
    </AppShell>
  )
}

function UploadTaskToastHost({
  task,
  onCancel,
  onRetry,
  onClose,
}: {
  task: UploadTaskSnapshot
  onCancel: () => void
  onRetry: () => void
  onClose: () => void
}) {
  const toastID = appStatusToastID

  useEffect(() => {
    toast.custom(
      (id) => (
        <UploadTaskToast
          toastID={id}
          task={task}
          onCancel={onCancel}
          onRetry={onRetry}
          onClose={onClose}
        />
      ),
      {
        id: toastID,
        duration: Infinity,
        dismissible: false,
        unstyled: true,
        position: 'bottom-right',
      },
    )
  }, [onCancel, onClose, onRetry, task, toastID])

  useEffect(() => () => {
    toast.dismiss(toastID)
  }, [toastID])

  return null
}

function UploadTaskToast({
  toastID,
  task,
  onCancel,
  onRetry,
  onClose,
}: {
  toastID: string | number
  task: UploadTaskSnapshot
  onCancel: () => void
  onRetry: () => void
  onClose: () => void
}) {
  const finished = task.completedFiles + task.skippedFiles
  const percent = task.totalBytes > 0
    ? Math.min(100, Math.round((task.uploadedBytes / task.totalBytes) * 100))
    : task.totalFiles > 0
      ? Math.round((finished / task.totalFiles) * 100)
      : 100
  const isRunning = task.status === 'running'
  const statusLabel = {
    queued: '准备上传',
    running: '正在上传',
    completed: '上传完成',
    completed_with_errors: '部分文件失败',
    cancelled: '已取消',
  }[task.status]
  const summary = task.status === 'completed'
    ? `已上传 ${task.completedFiles} 个文件。`
    : `${finished} / ${task.totalFiles} 个文件 · ${formatBytes(task.uploadedBytes)} / ${formatBytes(task.totalBytes)}`

  return (
    <section className={css.uploadToast} role="status" aria-live="polite" aria-label="上传任务">
      <div className={css.uploadToastHeader}>
        <div className={css.uploadToastTitleGroup}>
          <strong>{statusLabel}</strong>
          <span className={css.uploadToastMeta}>
            {summary}
          </span>
          {task.status === 'completed' && (
            <span className={css.uploadToastMeta}>
              {formatBytes(task.uploadedBytes)} / {formatBytes(task.totalBytes)}
            </span>
          )}
        </div>
        {!isRunning && (
          <button className={css.uploadToastClose} type="button" onClick={() => {
            toast.dismiss(toastID)
            onClose()
          }}>关闭</button>
        )}
      </div>
      <div className={css.uploadToastProgressTrack} role="progressbar" aria-label={`上传进度 ${percent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className={css.uploadToastProgressValue} style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      {task.failedFiles > 0 && (
        <ul className={css.uploadToastErrorList}>
          {task.items.filter((item) => item.status === 'failed').slice(0, 3).map((item) => (
            <li key={item.id}>{item.relativePath}：{item.error || '上传失败'}</li>
          ))}
          {task.failedFiles > 3 && <li>还有 {task.failedFiles - 3} 个失败项</li>}
        </ul>
      )}
      {(isRunning || task.failedFiles > 0) && (
        <div className={css.uploadToastActions}>
          {isRunning && <button type="button" className={css.uploadToastAction} onClick={onCancel}>取消上传</button>}
          {task.failedFiles > 0 && !isRunning && <button type="button" className={css.uploadToastAction} onClick={onRetry}>重试失败项</button>}
        </div>
      )}
    </section>
  )
}

function ClipboardBar({
  operation,
  items,
  canPaste,
  disabledReason,
  onPaste,
  onClear,
}: {
  operation: FileClipboardOperation
  items: FileClipboardItem[]
  canPaste: boolean
  disabledReason: string
  onPaste: () => void
  onClear: () => void
}) {
  const first = items[0]
  const sourceLocation = first ? `${first.sourceName} · ${parentPath(first.path)}` : ''
  const operationLabel = operation === 'copy' ? '已复制' : '已剪切'

  return (
    <section className={css.clipboardBar} role="region" aria-label="文件剪贴板">
      <span className={css.clipboardIcon} aria-hidden="true">
        {operation === 'copy' ? <IconCopy size={17} /> : <IconScissors size={17} />}
      </span>
      <div className={css.clipboardContent}>
        <div className={css.clipboardSummary}>
          <strong>{operationLabel} {items.length} 项</strong>
          <span className={css.clipboardMeta}>来源：{sourceLocation}</span>
        </div>
      </div>
      <div className={css.clipboardActions}>
        {disabledReason ? (
          <Tooltip content={disabledReason}>
            <Button onClick={onPaste} disabled={!canPaste}>
              <IconClipboard size={14} /> 粘贴到此处
            </Button>
          </Tooltip>
        ) : (
          <Button onClick={onPaste} disabled={!canPaste}>
            <IconClipboard size={14} /> 粘贴到此处
          </Button>
        )}
        <Button variant="ghost" onClick={onClear}>清空剪贴板</Button>
      </div>
    </section>
  )
}

function PasteTaskToastHost({
  task,
  onClose,
}: {
  task: PasteTaskSnapshot
  onClose: () => void
}) {
  const toastID = appStatusToastID

  useEffect(() => {
    toast.custom(
      (id) => <PasteTaskToast toastID={id} task={task} onClose={onClose} />,
      {
        id: toastID,
        duration: Infinity,
        dismissible: false,
        unstyled: true,
        position: 'bottom-right',
      },
    )
  }, [onClose, task, toastID])

  useEffect(() => () => {
    toast.dismiss(toastID)
  }, [toastID])

  return null
}

function PasteTaskToast({
  toastID,
  task,
  onClose,
}: {
  toastID: string | number
  task: PasteTaskSnapshot
  onClose: () => void
}) {
  const processed = task.completed + task.failed
  const percent = task.total > 0 ? Math.round((processed / task.total) * 100) : 100
  const verb = task.operation === 'copy' ? '复制' : '剪切'
  const title = task.status === 'running'
    ? `正在${verb}`
    : task.status === 'completed'
      ? '粘贴完成'
      : '粘贴完成，但有失败项'
  const summary = task.status === 'running'
    ? `${processed} / ${task.total} 项 · 当前：${task.current}`
    : task.failed > 0
      ? `${task.completed} 项成功，${task.failed} 项失败`
      : `已粘贴 ${task.completed} 项到 ${task.targetPath}`

  return (
    <section className={css.clipboardToast} role="status" aria-live="polite" aria-label="粘贴任务">
      <div className={css.uploadToastHeader}>
        <div className={css.uploadToastTitleGroup}>
          <strong>{title}</strong>
          <span className={css.uploadToastMeta}>{summary}</span>
        </div>
        {task.status !== 'running' && (
          <button className={css.uploadToastClose} type="button" onClick={() => {
            toast.dismiss(toastID)
            onClose()
          }}>关闭</button>
        )}
      </div>
      <div className={css.uploadToastProgressTrack} role="progressbar" aria-label={`粘贴进度 ${percent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className={css.uploadToastProgressValue} style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      {task.errors.length > 0 && (
        <ul className={css.uploadToastErrorList}>
          {task.errors.slice(0, 3).map((error) => <li key={error}>{error}</li>)}
          {task.errors.length > 3 && <li>还有 {task.errors.length - 3} 个失败项</li>}
        </ul>
      )}
    </section>
  )
}

function BatchDeleteTaskToastHost({ task, onClose }: {
  task: BatchDeleteTaskSnapshot
  onClose: () => void
}) {
  const toastID = appStatusToastID
  useEffect(() => {
    toast.custom(
      (id) => <BatchDeleteTaskToast toastID={id} task={task} onClose={onClose} />,
      { id: toastID, duration: Infinity, dismissible: false, unstyled: true, position: 'bottom-right' },
    )
  }, [onClose, task, toastID])
  useEffect(() => () => { toast.dismiss(toastID) }, [toastID])
  return null
}

function BatchDeleteTaskToast({ toastID, task, onClose }: {
  toastID: string | number
  task: BatchDeleteTaskSnapshot
  onClose: () => void
}) {
  const processed = task.completed + task.failed
  const percent = task.total > 0 ? Math.round((processed / task.total) * 100) : 100
  const title = task.status === 'running'
    ? '正在移入回收站'
    : task.failed > 0
      ? '批量删除完成，但有失败项'
      : '已移入回收站'
  const summary = task.status === 'running'
    ? `${processed} / ${task.total} 项 · 当前：${task.current}`
    : task.failed > 0
      ? `${task.completed} 项成功，${task.failed} 项失败；失败项仍保持选中`
      : `已处理 ${task.completed} 项`

  return (
    <section className={css.clipboardToast} role="status" aria-live="polite" aria-label="批量删除任务">
      <div className={css.uploadToastHeader}>
        <div className={css.uploadToastTitleGroup}>
          <strong>{title}</strong>
          <span className={css.uploadToastMeta}>{summary}</span>
        </div>
        {task.status !== 'running' && (
          <button className={css.uploadToastClose} type="button" onClick={() => {
            toast.dismiss(toastID)
            onClose()
          }}>关闭</button>
        )}
      </div>
      <div className={css.uploadToastProgressTrack} role="progressbar" aria-label={`删除进度 ${percent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className={css.uploadToastProgressValue} style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      {task.errors.length > 0 && (
        <ul className={css.uploadToastErrorList}>
          {task.errors.slice(0, 3).map((error) => <li key={error}>{error}</li>)}
          {task.errors.length > 3 && <li>还有 {task.errors.length - 3} 个失败项</li>}
        </ul>
      )}
    </section>
  )
}

function DirectoryUploadDialog({
  open,
  onOpenChange,
  supportsDirectoryPicker,
  onChoose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  supportsDirectoryPicker: boolean
  onChoose: () => void
}) {
  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title="上传目录"
      description="选择一个目录，目录中的文件会按原有层级上传到当前位置。"
      footer={(
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={onChoose}>选择目录</Button>
        </>
      )}
    >
      <p className={css.dialogHint}>
        {supportsDirectoryPicker
          ? '选择后会读取目录中的文件，并保留子目录结构。'
          : '当前浏览器不支持目录读取 API，将使用兼容模式选择目录。'}
      </p>
    </DialogWrap>
  )
}

function UploadConflictDialog({
  item,
  onDecision,
}: {
  item: UploadTaskItem
  onDecision: (decision: UploadConflictDecision) => void
}) {
  return (
    <DialogWrap
      open
      onOpenChange={(open) => {
        if (!open) onDecision('cancel')
      }}
      title="发现重名文件"
      description="请选择本次上传任务遇到同名文件时的处理方式。"
      footer={(
        <>
          <Button variant="secondary" onClick={() => onDecision('skip')}>跳过冲突文件</Button>
          <Button variant="danger" onClick={() => onDecision('overwrite')}>覆盖冲突文件</Button>
        </>
      )}
    >
      <p className={css.dialogHint}>
        <strong>{item.relativePath}</strong> 已存在。选择后，后续同类冲突将沿用这个策略。
      </p>
      <Button variant="ghost" onClick={() => onDecision('cancel')}>取消整个上传任务</Button>
    </DialogWrap>
  )
}

type DirectoryHandleWithValues = FileSystemDirectoryHandle & {
  values: () => AsyncIterableIterator<FileSystemFileHandle | DirectoryHandleWithValues>
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleWithValues>
}

function getDirectoryPickerWindow() {
  return window as DirectoryPickerWindow
}

function hasDirectoryPicker() {
  return typeof window !== 'undefined' && typeof getDirectoryPickerWindow().showDirectoryPicker === 'function'
}

async function readDirectoryFiles(
  directory: DirectoryHandleWithValues,
  parentPath = directory.name,
): Promise<File[]> {
  const files: File[] = []
  for await (const entry of directory.values()) {
    const relativePath = `${parentPath}/${entry.name}`
    if (entry.kind === 'directory') {
      files.push(...await readDirectoryFiles(entry as DirectoryHandleWithValues, relativePath))
    } else {
      const file = await (entry as FileSystemFileHandle).getFile()
      files.push(withRelativePath(file, relativePath))
    }
  }
  return files.sort((a, b) => uploadRelativePath(a).localeCompare(uploadRelativePath(b)))
}

function withRelativePath(file: File, relativePath: string) {
  const copy = new File([file], file.name, { type: file.type, lastModified: file.lastModified })
  Object.defineProperty(copy, 'webkitRelativePath', { value: relativePath })
  return copy
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function normalizePath(path: string) {
  const normalized = `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`
  return normalized === '/' ? '/' : normalized
}

function joinPath(directory: string, name: string) {
  const normalized = normalizePath(directory)
  return normalized === '/' ? `/${name}` : `${normalized}/${name}`
}

function parentPath(path: string) {
  const normalized = normalizePath(path)
  const slash = normalized.lastIndexOf('/')
  return slash <= 0 ? '/' : normalized.slice(0, slash)
}

function isPathInside(path: string, directory: string) {
  const normalizedPath = normalizePath(path)
  const normalizedDirectory = normalizePath(directory)
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`)
}

function getPasteDisabledReason(
  items: FileClipboardItem[],
  operation: FileClipboardOperation | null,
  targetSourceKey: string,
  targetPath: string,
  canWrite: boolean,
) {
  if (!operation || items.length === 0) return '剪贴板为空'
  if (!canWrite) return '当前目录只读，无法粘贴'

  const normalizedTarget = normalizePath(targetPath)
  for (const item of items) {
    if (item.sourceKey !== targetSourceKey) continue
    if (normalizedTarget === parentPath(item.path)) {
      return `目标目录与“${item.name}”的来源目录相同`
    }
    if (item.type === 'dir' && isPathInside(normalizedTarget, item.path)) {
      return `不能把“${item.name}”粘贴到自身目录内`
    }
  }
  return ''
}

function SelectionToolbar({
  count,
  canCut,
  canDelete,
  onCopy,
  onCut,
  onDelete,
  onClear,
}: {
  count: number
  canCut: boolean
  canDelete: boolean
  onCopy: () => void
  onCut: () => void
  onDelete: () => void
  onClear: () => void
}) {
  return (
    <div className={css.selectionToolbar} role="toolbar" aria-label="批量文件操作">
      <strong>已选择 {count} 项</strong>
      <span className={css.selectionToolbarHint}>选择复制或剪切，前往目标目录后粘贴</span>
      <span className={css.selectionToolbarActions}>
        <Button variant="secondary" onClick={onCopy}><IconCopy size={14} /> 复制</Button>
        {canCut && <Button onClick={onCut}><IconScissors size={14} /> 剪切</Button>}
        {canCut && <Button variant="dangerGhost" onClick={onDelete} disabled={!canDelete}><IconTrash size={14} /> 移入回收站</Button>}
        <button className={css.selectionClear} type="button" onClick={onClear}>取消选择</button>
      </span>
    </div>
  )
}

function BatchDeleteDialog({ entries, onClose, onConfirm }: {
  entries: FileEntry[]
  onClose: () => void
  onConfirm: () => void
}) {
  const preview = entries.slice(0, 5)
  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={`将 ${entries.length} 项移入回收站？`}
      description="批量删除确认"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="danger" onClick={onConfirm} disabled={entries.length === 0}>移入回收站</Button>
        </>
      }
    >
      <p style={{ margin: '0 0 10px', fontSize: vars.fontSize.sm, color: vars.color.text }}>
        选中的项目会移入回收站；文件夹及其内容会一起移动，之后可在回收站恢复。
      </p>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: vars.fontSize.sm, color: vars.color.textSecondary }}>
        {preview.map((entry) => <li key={entry.name}>{entry.name}{entry.type === 'dir' ? '（文件夹）' : ''}</li>)}
        {entries.length > preview.length ? <li>以及其他 {entries.length - preview.length} 项</li> : null}
      </ul>
    </DialogWrap>
  )
}

// --- 面包屑 ---

function Breadcrumb({
  sourceKey,
  sourceName,
  sources,
  currentPath,
  upOne,
}: {
  sourceKey: string
  sourceName: string
  sources: UserSource[]
  currentPath: string
  upOne: () => void
}) {
  const navigate = useNavigate()
  const segs = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean)
  const sourceItems: MenuOption[] = sources.map((source) => ({
    id: source.key,
    label: source.name,
    icon: source.key === sourceKey ? <IconCheck size={14} /> : undefined,
    current: source.key === sourceKey,
    onSelect: () => navigate({
      to: '/app/sources/$sourceKey',
      params: { sourceKey: source.key },
      search: { path: '/', page: 1 },
    }),
  }))
  return (
    <nav className={css.crumb} aria-label="面包屑">
      <Menu
        ariaLabel="存储源列表"
        triggerClassName={css.crumbSourceTrigger}
        trigger={<><IconHome size={14} /> 存储源列表 <IconChevronDown size={12} /></>}
        items={sourceItems}
      />
      <span className={css.crumbSep}>/</span>
      <span
        className={segs.length === 0 ? css.crumbCurrent : css.crumbLink}
        onClick={() => segs.length > 0 && upOne()}
      >
        {sourceName}
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
                to: '/app/sources/$sourceKey',
                params: { sourceKey },
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

type EntryAction = MenuOption

function EntryActionsMenu({ entryName, items }: { entryName: string; items: EntryAction[] }) {
  return (
    <Menu
      ariaLabel={`更多操作 ${entryName}`}
      triggerClassName={css.actionMenuTrigger}
      trigger={<IconMore size={15} />}
      items={items}
    />
  )
}

// --- 网格视图（轻量） ---

function GridView({
  entries,
  loading,
  onOpenDir,
  onDelete,
  onRename,
  onCopy,
  onCut,
  onShare,
  canWrite,
  filter,
  selectedNames,
  onToggleSelected,
}: {
  entries: FileEntry[]
  loading?: boolean
  onOpenDir: (name: string) => void
  onDelete: (name: string, type: string) => void
  onRename: (name: string) => void
  onCopy: (name: string) => void
  onCut: (name: string) => void
  onShare: (name: string, type: 'file' | 'dir') => void
  canWrite: boolean
  filter: string
  selectedNames: ReadonlySet<string>
  onToggleSelected: (name: string, selected: boolean) => void
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
          {e.type !== 'unsupported' && (
            <label style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                aria-label={`选择 ${e.name}`}
                checked={selectedNames.has(e.name)}
                onChange={(event) => onToggleSelected(e.name, event.target.checked)}
                onClick={(event) => event.stopPropagation()}
              />
              选择
            </label>
          )}
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
          {e.type !== 'unsupported' && (
            <span style={{ display: 'flex', gap: 4 }}>
              <button className={css.actionBtn} title="复制" onClick={() => onCopy(e.name)}>
                <IconCopy size={12} />
              </button>
              {canWrite && (
                <>
                  <button
                    className={css.actionBtn}
                    title="创建分享"
                    onClick={() => onShare(e.name, e.type as 'file' | 'dir')}
                  >
                    <IconLink size={12} />
                  </button>
                  <EntryActionsMenu
                    entryName={e.name}
                    items={[
                      { id: 'rename', label: '重命名', icon: <IconEdit size={12} />, onSelect: () => onRename(e.name) },
                      { id: 'cut', label: '剪切', icon: <IconScissors size={12} />, onSelect: () => onCut(e.name) },
                      {
                        id: 'delete',
                        label: '删除',
                        icon: <IconTrash size={12} />,
                        danger: true,
                        onSelect: () => onDelete(e.name, e.type),
                      },
                    ]}
                  />
                </>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// --- 右栏：存储源信息卡 ---

function quotaLabel(quota?: StorageQuota): string {
  if (!quota) return '统计中…'
  if (quota.unlimited) return `${formatBytes(quota.usage_bytes)} / 不限`
  return `${formatBytes(quota.usage_bytes)} / ${formatBytes(quota.quota_bytes)}`
}

function SourceInfoCard({
  source,
  currentPermission,
  quota,
  userQuota,
}: {
  source: UserSource
  currentPermission: 'read_only' | 'read_write'
  quota?: StorageQuota
  userQuota?: UserQuota
}) {
  return (
    <aside className={css.sideCol}>
      <section className={css.sidePanel}>
        <header className={css.sidePanelHeader}>存储源信息</header>
        <div className={css.sidePanelBody}>
          <Row label="存储源名称" value={source.name} />
          <Row
            label="当前目录权限"
            value={currentPermission === 'read_write' ? '读写' : '只读'}
            badge={currentPermission === 'read_write' ? 'blue' : 'gray'}
          />
          <Row
            label="存储用量"
            value={quotaLabel(quota)}
          />
          <Row
            label="我的用量"
            value={quotaLabel(userQuota)}
          />
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
            <div className={css.sideKvRow}>
              <span className={css.sideKvLabel}>WebDAV</span>
              <a className={css.sideLink} href="/dav" target="_blank" rel="noreferrer">
                <IconLink size={12} /> <span>/dav</span>
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

// --- 弹窗：新建 / 重命名 / 删除 ---

function MkdirDialog({
  open,
  onOpenChange,
  onCreated,
  sourceKey,
  currentPath,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
  sourceKey: string
  currentPath: string
}) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) { setName(''); setErr('') }
  }, [open])

  const mut = useMutation({
    mutationFn: () => createFolder(sourceKey, currentPath, name.trim()),
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
  sourceKey,
  currentPath,
  target,
  onClose,
  onChanged,
}: {
  sourceKey: string
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
    mutationFn: () => renameFile(sourceKey, fullPath, name.trim()),
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

function ShareDialog({
  sourceKey,
  currentPath,
  target,
  onClose,
}: {
  sourceKey: string
  currentPath: string
  target: { name: string; type: 'file' | 'dir' }
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [expiryDays, setExpiryDays] = useState('0')
  const [maxDownloads, setMaxDownloads] = useState('0')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<FileShare | null>(null)
  const [copied, setCopied] = useState(false)
  const fullPath = currentPath === '/' ? `/${target.name}` : `${currentPath}/${target.name}`

  const mutation = useMutation({
    mutationFn: () => {
      const days = Number(expiryDays)
      return createShare({
        sourceKey,
        path: fullPath,
        password: password.trim(),
        expiresAt: days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : undefined,
        maxDownloads: Number(maxDownloads || 0),
      })
    },
    onSuccess: async (share) => {
      setCreated(share)
      await queryClient.invalidateQueries({ queryKey: ['shares'] })
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : '创建分享失败'),
  })

  function submit() {
    setError('')
    const limit = Number(maxDownloads || 0)
    if (!Number.isInteger(limit) || limit < 0 || limit > 1_000_000) {
      setError('下载次数上限必须是 0 到 1000000 之间的整数')
      return
    }
    if (password.trim() && [...password.trim()].length < 4) {
      setError('访问密码至少需要 4 个字符')
      return
    }
    mutation.mutate()
  }

  async function copyCreatedLink() {
    if (!created) return
    await navigator.clipboard.writeText(created.url)
    setCopied(true)
  }

  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={created ? '分享已创建' : `分享${target.type === 'dir' ? '文件夹' : '文件'}`}
      description={fullPath}
      wide
      footer={created ? (
        <>
          <Button variant="secondary" onClick={copyCreatedLink}>
            <IconCopy size={14} /> {copied ? '已复制' : '复制链接'}
          </Button>
          <Button onClick={onClose}>完成</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending ? '创建中…' : '创建分享'}
          </Button>
        </>
      )}
    >
      {created ? (
        <Field label="分享链接" hint="链接可随时在“分享”页面复制或撤销。">
          <Input readOnly value={created.url} onFocus={(event) => event.currentTarget.select()} />
        </Field>
      ) : (
        <>
          <Field label="访问密码" hint="选填；设置后访问者需要先验证密码。">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="留空表示无需密码"
              maxLength={128}
            />
          </Field>
          <Field label="有效期">
            <Select
              value={expiryDays}
              onValueChange={setExpiryDays}
              options={[
                { value: '0', label: '永久有效' },
                { value: '1', label: '1 天' },
                { value: '7', label: '7 天' },
                { value: '30', label: '30 天' },
                { value: '90', label: '90 天' },
              ]}
              ariaLabel="分享有效期"
            />
          </Field>
          <Field label="下载次数上限" hint="填写 0 表示不限制；目录内每次文件下载均计数。" error={error}>
            <Input
              type="number"
              min={0}
              max={1000000}
              step={1}
              value={maxDownloads}
              onChange={(event) => setMaxDownloads(event.target.value)}
            />
          </Field>
        </>
      )}
    </DialogWrap>
  )
}

function DeleteDialog({
  sourceKey,
  currentPath,
  target,
  onClose,
  onChanged,
  onError,
}: {
  sourceKey: string
  currentPath: string
  target: { name: string; type: string }
  onClose: () => void
  onChanged: () => void
  onError: (error: unknown) => void
}) {
  const fullPath = currentPath === '/' ? `/${target.name}` : `${currentPath}/${target.name}`
  const isDir = target.type === 'dir'
  const mut = useMutation({
    mutationFn: () => deleteFile(sourceKey, fullPath),
    onSuccess: () => { onClose(); onChanged() },
    onError,
  })

  return (
    <DialogWrap
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      title="移入回收站"
      description={fullPath}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="danger" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? '移动中…' : '移入回收站'}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: vars.fontSize.sm, color: vars.color.text }}>
        {isDir
          ? `目录「${target.name}」及其中内容会移入回收站，可在永久清理前恢复。`
          : `「${target.name}」会移入回收站，可在永久清理前恢复。`}
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
