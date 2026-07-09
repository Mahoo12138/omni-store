import { useRef } from 'react'
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
import { Button } from '../components/ui/Button'
import { formatBytes, formatDate } from '../utils/format'
import * as css from './FileManager.css'

// 私有网页文件管理器（README §13/§25.6）。
export function FileManagerPage() {
  const { sourceId } = useParams({ from: '/app/sources/$sourceId' })
  const search = useSearch({ from: '/app/sources/$sourceId' })
  const path = search.path || '/'
  const page = search.page || 1
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const source = sources.data?.find((s) => s.source_id === sourceId)
  const canWrite = source?.permission === 'read_write'

  const filesQuery = useQuery({
    queryKey: ['files', sourceId, path, page],
    queryFn: () => listFiles(sourceId, { path, page }),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['files', sourceId] })
  }

  function goTo(newPath: string, newPage = 1) {
    navigate({
      to: '/app/sources/$sourceId',
      params: { sourceId },
      search: { path: newPath, page: newPage },
    })
  }

  function childPath(name: string) {
    return path === '/' ? `/${name}` : `${path}/${name}`
  }

  const onError = (err: unknown) => {
    alert(err instanceof ApiRequestError ? err.message : '操作失败')
  }

  const mkdirMut = useMutation({
    mutationFn: (name: string) => createFolder(sourceId, path, name),
    onSuccess: refresh,
    onError,
  })

  const deleteMut = useMutation({
    mutationFn: (target: string) => deleteFile(sourceId, target),
    onSuccess: refresh,
    onError,
  })

  const renameMut = useMutation({
    mutationFn: ({ target, name }: { target: string; name: string }) =>
      renameFile(sourceId, target, name),
    onSuccess: refresh,
    onError,
  })

  const moveMut = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => moveFile(sourceId, from, to),
    onSuccess: refresh,
    onError,
  })

  async function onUpload(files: FileList | null) {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      try {
        await uploadFile(sourceId, path, file)
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'FILE_ALREADY_EXISTS') {
          // 同名冲突：确认后带 overwrite=true 重传（README §13.4）。
          if (confirm(`文件 ${file.name} 已存在，是否覆盖？`)) {
            try {
              await uploadFile(sourceId, path, file, true)
              continue
            } catch (err2) {
              onError(err2)
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

  function onDelete(entry: FileEntry) {
    const target = childPath(entry.name)
    const msg =
      entry.type === 'dir'
        ? `确定要删除目录「${entry.name}」吗？目录内所有内容都会被永久删除，此操作不可恢复。`
        : `确定要永久删除「${entry.name}」吗？此操作不可恢复。`
    if (confirm(msg)) {
      deleteMut.mutate(target)
    }
  }

  function onRename(entry: FileEntry) {
    const name = prompt('新名称：', entry.name)
    if (name && name !== entry.name) {
      renameMut.mutate({ target: childPath(entry.name), name })
    }
  }

  function onMove(entry: FileEntry) {
    const to = prompt('移动到（存储源内完整目标路径，例如 /docs/2026/a.txt）：', childPath(entry.name))
    if (to && to !== childPath(entry.name)) {
      moveMut.mutate({ from: childPath(entry.name), to })
    }
  }

  function onMkdir() {
    const name = prompt('新目录名称：')
    if (name) mkdirMut.mutate(name)
  }

  // 面包屑
  const crumbs = path.split('/').filter(Boolean)

  return (
    <AppShell>
      <h1 className={css.pageTitle}>{source?.name ?? sourceId}</h1>
      <div className={css.toolbar}>
        <nav className={css.breadcrumb}>
          <button className={css.crumbLink} onClick={() => goTo('/')}>
            根目录
          </button>
          {crumbs.map((seg, i) => (
            <span key={i}>
              {' / '}
              <button
                className={css.crumbLink}
                onClick={() => goTo('/' + crumbs.slice(0, i + 1).join('/'))}
              >
                {seg}
              </button>
            </span>
          ))}
        </nav>
        {canWrite && (
          <div className={css.toolbarActions}>
            <Button variant="secondary" onClick={onMkdir}>
              新建目录
            </Button>
            <Button onClick={() => fileInput.current?.click()}>上传文件</Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => onUpload(e.target.files)}
            />
          </div>
        )}
      </div>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th className={css.th}>名称</th>
              <th className={css.th}>大小</th>
              <th className={css.th}>修改时间</th>
              <th className={css.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filesQuery.data?.items.map((entry) => (
              <tr key={entry.name}>
                <td className={css.nameCell}>
                  {entry.type === 'dir' ? (
                    <button className={css.rowLink} onClick={() => goTo(childPath(entry.name))}>
                      📁 {entry.name}
                    </button>
                  ) : entry.type === 'file' ? (
                    <span>📄 {entry.name}</span>
                  ) : (
                    <span className={css.muted}>🔗 {entry.name}（不支持）</span>
                  )}
                </td>
                <td className={css.td}>{entry.type === 'file' ? formatBytes(entry.size) : '-'}</td>
                <td className={css.td}>{formatDate(entry.mtime)}</td>
                <td className={css.td}>
                  {entry.type === 'file' && (
                    <a
                      className={css.actionBtn}
                      href={downloadFileUrl(sourceId, childPath(entry.name))}
                    >
                      下载
                    </a>
                  )}
                  {canWrite && entry.type !== 'unsupported' && (
                    <>
                      <button className={css.actionBtn} onClick={() => onRename(entry)}>
                        重命名
                      </button>
                      <button className={css.actionBtn} onClick={() => onMove(entry)}>
                        移动
                      </button>
                      <button className={css.actionBtnDanger} onClick={() => onDelete(entry)}>
                        删除
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filesQuery.isSuccess && filesQuery.data.items.length === 0 && (
          <div className={css.empty}>目录为空</div>
        )}
        {filesQuery.isError && <div className={css.empty}>加载失败</div>}
      </div>

      {filesQuery.isSuccess && (filesQuery.data.has_next || page > 1) && (
        <div className={css.pager}>
          <span>
            第 {page} 页 / 共 {filesQuery.data.total} 项
          </span>
          <Button variant="secondary" disabled={page <= 1} onClick={() => goTo(path, page - 1)}>
            上一页
          </Button>
          <Button
            variant="secondary"
            disabled={!filesQuery.data.has_next}
            onClick={() => goTo(path, page + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </AppShell>
  )
}
