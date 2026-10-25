import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiRequestError } from '../../api/client'
import {
  downloadFileUrl,
  fetchMySources,
  searchFiles,
} from '../../api/sources'
import { DialogWrap } from '../ui/Dialog'
import { Button } from '../ui/Button'
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFile,
  IconFolder,
  IconSearch,
  IconServer,
} from '../ui/Icon'
import { Select } from '../ui/Select'
import { formatBytes, formatDate } from '../../utils/format'
import { useStyles } from './SearchDialog.styles'

// 呼出全局搜索弹窗的窗口事件:AppShell 挂 ⌘K/Ctrl+K,页面内按钮调用 openSearchDialog()。
const OPEN_SEARCH_EVENT = 'omnistore:open-search'

export function openSearchDialog() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))
}

export function SearchDialog() {
  const css = useStyles()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [draftQuery, setDraftQuery] = useState('')
  const [draftSource, setDraftSource] = useState('')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(1)
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener(OPEN_SEARCH_EVENT, handler)
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, handler)
  }, [])

  const normalizedQuery = query.trim()
  const hasQuery = Array.from(normalizedQuery).length >= 2
  const results = useQuery({
    queryKey: ['file-search', normalizedQuery, source, page],
    queryFn: () => searchFiles({
      query: normalizedQuery,
      sourceKey: source || undefined,
      page,
      pageSize: 20,
    }),
    enabled: open && hasQuery,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = draftQuery.trim()
    if (Array.from(next).length < 2) return
    setQuery(next)
    setSource(draftSource)
    setPage(1)
  }

  function openParent(sourceKey: string, parentPath: string) {
    setOpen(false)
    navigate({
      to: '/app/sources/$sourceKey',
      params: { sourceKey },
      search: { path: parentPath ? `/${parentPath}` : '/', page: 1 },
    })
  }

  const data = results.data
  return (
    <DialogWrap open={open} onOpenChange={setOpen} title="全局搜索" wide>
      <p className={css.dialogHint}>跨存储源查找文件名或路径，只显示你有权访问的内容。</p>
      <form className={css.searchPanel} onSubmit={submit}>
        <label className={css.queryField}>
          <span className={css.srOnly}>搜索关键字</span>
          <IconSearch size={18} />
          <input
            className={css.queryInput}
            autoFocus
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="输入至少 2 个字符"
          />
        </label>
        <Select
          value={draftSource}
          onValueChange={setDraftSource}
          ariaLabel="筛选存储源"
          width="wide"
          options={[
            { value: '', label: '全部存储源' },
            ...(sources.data ?? []).map((item) => ({ value: item.key, label: item.name })),
          ]}
          leadingIcon={<IconServer size={17} />}
          leadingIconVariant="plain"
          disabled={sources.isPending}
        />
        <Button type="submit" disabled={Array.from(draftQuery.trim()).length < 2}>搜索</Button>
      </form>

      {!hasQuery ? (
        <section className={css.emptyState}>
          <span className={css.emptyIcon}><IconSearch size={24} /></span>
          <h2 className={css.emptyTitle}>从所有文件中查找</h2>
          <span>支持文件名和完整相对路径；回收站与排除路径不会出现在结果中。</span>
        </section>
      ) : results.isPending ? (
        <section className={css.emptyState} aria-busy="true">正在搜索索引…</section>
      ) : results.isError ? (
        <section className={css.emptyState} role="alert">
          <h2 className={css.emptyTitle}>搜索失败</h2>
          <span>{results.error instanceof ApiRequestError ? results.error.message : '请稍后重试。'}</span>
          <Button variant="secondary" onClick={() => results.refetch()}>重试</Button>
        </section>
      ) : data && data.total === 0 ? (
        <section className={css.emptyState}>
          <span className={css.emptyIcon}><IconFile size={24} /></span>
          <h2 className={css.emptyTitle}>没有找到匹配文件</h2>
          <span>尝试缩短关键字，或切换到其他存储源。</span>
        </section>
      ) : data ? (
        <section className={css.results} aria-label="搜索结果">
          <div className={css.resultsHeader}>
            <div>
              <span className={css.resultCount}>{data.total}</span> 个匹配结果
            </div>
            <span>第 {data.page} 页</span>
          </div>
          <div className={css.resultList}>
            {data.items.map((item) => (
              <article className={css.resultRow} key={`${item.source_key}:${item.path}`}>
                <span className={css.fileIcon}><IconFile size={18} /></span>
                <div className={css.fileIdentity}>
                  <a className={css.fileLink} href={downloadFileUrl(item.source_key, `/${item.path}`)}>{item.name}</a>
                  <span className={css.filePath}>{item.source_name} · /{item.path}</span>
                </div>
                <div className={css.fileMeta}>
                  <span>{formatBytes(item.size)}</span>
                  <time dateTime={item.modified_at}>{formatDate(item.modified_at)}</time>
                </div>
                <div className={css.actions}>
                  <button
                    type="button"
                    className={css.actionBtn}
                    onClick={() => openParent(item.source_key, item.parent_path)}
                    title="打开所在目录"
                  >
                    <IconFolder size={16} />
                  </button>
                  <a
                    className={css.actionBtn}
                    href={downloadFileUrl(item.source_key, `/${item.path}`)}
                    title={`下载 ${item.name}`}
                  >
                    <IconDownload size={16} />
                  </a>
                </div>
              </article>
            ))}
          </div>
          <nav className={css.pagination} aria-label="搜索结果分页">
            <Button
              variant="secondary"
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
            >
              <IconChevronLeft size={15} /> 上一页
            </Button>
            <span>{data.page} / {Math.max(1, Math.ceil(data.total / data.page_size))}</span>
            <Button
              variant="secondary"
              disabled={!data.has_next}
              onClick={() => setPage(data.page + 1)}
            >
              下一页 <IconChevronRight size={15} />
            </Button>
          </nav>
        </section>
      ) : null}
    </DialogWrap>
  )
}
