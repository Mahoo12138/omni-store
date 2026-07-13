import { useRef, useState } from 'react'
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
} from '../api/sources'
import type { FileEntry } from '../api/sources'
import { ApiRequestError } from '../api/client'
import { AppShell } from '../components/layout/AppShell'
import { FileTable } from '../components/files/FileTable'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import {
  IconDownload,
  IconEdit,
  IconFolderPlus,
  IconMove,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUpload,
} from '../components/ui/Icon'
import * as ft from '../components/files/FileTable.css'

export function FileManagerPage() {
  const { sourceId } = useParams({ from: '/app/sources/$sourceId' })
  const search = useSearch({ from: '/app/sources/$sourceId' })
  const currentPath = search.path || '/'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState('')

  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const source = sources.data?.find((s) => s.source_id === sourceId)
  const canWrite = source?.permission === 'read_write'
  const title = source?.name ?? sourceId

  const filesQuery = useQuery({
    queryKey: ['files', sourceId, currentPath],
    queryFn: () => listFiles(sourceId, { path: currentPath }),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['files', sourceId] })
  }

  function goTo(dir: string) {
    setFilter('')
    const abs = currentPath === '/' ? `/${dir}` : `${currentPath}/${dir}`
    navigate({
      to: '/app/sources/$sourceId',
      params: { sourceId },
      search: { path: abs, page: 1 },
    })
  }

  function upOne() {
    const parent = currentPath.replace(/\/[^/]+$/, '') || '/'
    navigate({
      to: '/app/sources/$sourceId',
      params: { sourceId },
      search: { path: parent, page: 1 },
    })
  }

  const onError = (err: unknown) => {
    alert(err instanceof ApiRequestError ? err.message : '操作失败')
  }

  const mkdirMut = useMutation({
    mutationFn: () => createFolder(sourceId, currentPath, prompt('新目录名称：')!),
    onSuccess: refresh,
    onError,
  })

  const deleteMut = useMutation({
    mutationFn: (entry: FileEntry) => {
      const target = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`
      const msg =
        entry.type === 'dir'
          ? `确定要删除目录「${entry.name}」吗？目录内所有内容都会被永久删除，此操作不可恢复。`
          : `确定要永久删除「${entry.name}」吗？此操作不可恢复。`
      if (confirm(msg)) return deleteFile(sourceId, target)
      return Promise.resolve()
    },
    onSuccess: refresh,
    onError,
  })

  const renameMut = useMutation({
    mutationFn: (entry: FileEntry) => {
      const name = prompt('新名称：', entry.name)
      if (name && name !== entry.name) {
        return renameFile(
          sourceId,
          currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`,
          name,
        )
      }
      return Promise.resolve()
    },
    onSuccess: refresh,
    onError,
  })

  const moveMut = useMutation({
    mutationFn: (entry: FileEntry) => {
      const from = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`
      const to = prompt('移动到（存储源内完整目标路径）：', from)
      if (to && to !== from) return moveFile(sourceId, from, to)
      return Promise.resolve()
    },
    onSuccess: refresh,
    onError,
  })

  async function onUpload(files: FileList | null) {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      try {
        await uploadFile(sourceId, currentPath, file)
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'FILE_ALREADY_EXISTS') {
          if (confirm(`文件 ${file.name} 已存在，是否覆盖？`)) {
            try {
              await uploadFile(sourceId, currentPath, file, true)
            } catch (_) {
              onError(err)
            }
          }
        } else {
          onError(err)
        }
      }
    }
    refresh()
    if (fileInput.current) fileInput.current.value = ''
  }

  const entries =
    filesQuery.data?.items.filter((e) => {
      if (!filter.trim()) return true
      return e.name.toLowerCase().includes(filter.trim().toLowerCase())
    }) ?? []

  return (
    <AppShell title={title}>
      <div className={ft.toolbar}>
        <div className={ft.toolbarGroup}>
          {currentPath !== '/' && (
            <Button variant="secondary" onClick={upOne}>
              向上一级
            </Button>
          )}
          {source && (
            <span className={ft.toolbarGroup} style={{ paddingLeft: 8 }}>
              <Badge color={canWrite ? 'blue' : 'gray'}>
                {canWrite ? '读写' : '只读'}
              </Badge>
              {source.webdav_enabled && <Badge color="gray">WebDAV</Badge>}
              {source.image_bed_enabled && <Badge color="purple">图床</Badge>}
            </span>
          )}
        </div>
        <div className={ft.toolbarGroup}>
          <span className={ft.searchBox}>
            <span className={ft.searchIcon}>
              <IconSearch size={16} />
            </span>
            <input
              className={ft.searchInput}
              placeholder="筛选当前目录"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </span>
          <Button variant="ghost" aria-label="刷新" onClick={refresh}>
            <IconRefresh />
          </Button>
          {canWrite && (
            <>
              <Button variant="ghost" aria-label="新建目录" onClick={() => mkdirMut.mutate()}>
                <IconFolderPlus />
              </Button>
              <Button
                variant="ghost"
                aria-label="上传文件"
                onClick={() => fileInput.current?.click()}
              >
                <IconUpload />
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
        </div>
      </div>

      <FileTable
        entries={filesQuery.isError ? [] : entries}
        loading={filesQuery.isPending}
        emptyTitle={
          filesQuery.isError
            ? '加载失败'
            : filter
              ? '没有匹配的条目'
              : canWrite
                ? '目录为空，上传一个文件或新建一个目录'
                : '目录为空'
        }
        emptyHint={canWrite && !filter ? '点击右上角按钮上传文件或新建目录。' : undefined}
        onOpenDir={goTo}
        fileHref={(entry) => downloadFileUrl(sourceId, currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`)}
        renderActions={(entry) => {
          if (!canWrite && entry.type === 'file') {
            return (
              <span className={ft.actions}>
                <a
                  className={ft.actionBtn}
                  href={downloadFileUrl(
                    sourceId,
                    currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`,
                  )}
                  aria-label={`下载 ${entry.name}`}
                  title="下载"
                >
                  <IconDownload size={16} />
                </a>
              </span>
            )
          }
          if (!canWrite || entry.type === 'unsupported') return null
          return (
            <span className={ft.actions}>
              {entry.type === 'file' && (
                <a
                  className={ft.actionBtn}
                  href={downloadFileUrl(
                    sourceId,
                    currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`,
                  )}
                  aria-label={`下载 ${entry.name}`}
                  title="下载"
                >
                  <IconDownload size={16} />
                </a>
              )}
              <button
                className={ft.actionBtn}
                aria-label={`重命名 ${entry.name}`}
                title="重命名"
                onClick={() => renameMut.mutate(entry)}
              >
                <IconEdit size={16} />
              </button>
              <button
                className={ft.actionBtn}
                aria-label={`移动 ${entry.name}`}
                title="移动"
                onClick={() => moveMut.mutate(entry)}
              >
                <IconMove size={16} />
              </button>
              <button
                className={ft.actionBtnDanger}
                aria-label={`删除 ${entry.name}`}
                title="删除"
                onClick={() => deleteMut.mutate(entry)}
              >
                <IconTrash size={16} />
              </button>
            </span>
          )
        }}
      />
    </AppShell>
  )
}
