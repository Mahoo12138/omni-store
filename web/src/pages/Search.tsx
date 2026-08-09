import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import {
  downloadFileUrl,
  fetchMySources,
  searchFiles,
} from '../api/sources'
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFile,
  IconFolder,
  IconServer,
  IconSearch,
} from '../components/ui/Icon'
import { Select } from '../components/ui/Select'
import { formatBytes, formatDate } from '../utils/format'
import * as css from './Search.css'

export function SearchPage() {
  const search = useSearch({ from: '/app/search' })
  const navigate = useNavigate()
  const [draftQuery, setDraftQuery] = useState(search.q)
  const [draftSource, setDraftSource] = useState(search.source)
  const normalizedQuery = search.q.trim()
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const results = useQuery({
    queryKey: ['file-search', normalizedQuery, search.source, search.page],
    queryFn: () => searchFiles({
      query: normalizedQuery,
      sourceKey: search.source || undefined,
      page: search.page,
      pageSize: 20,
    }),
    enabled: Array.from(normalizedQuery).length >= 2,
  })

  useEffect(() => {
    setDraftQuery(search.q)
    setDraftSource(search.source)
  }, [search.q, search.source])

  function submit(event: FormEvent) {
    event.preventDefault()
    const query = draftQuery.trim()
    if (Array.from(query).length < 2) return
    navigate({ to: '/app/search', search: { q: query, source: draftSource, page: 1 } })
  }

  function changePage(page: number) {
    navigate({ to: '/app/search', search: { q: search.q, source: search.source, page } })
  }

  function openParent(sourceKey: string, parentPath: string) {
    navigate({
      to: '/app/sources/$sourceKey',
      params: { sourceKey },
      search: { path: parentPath ? `/${parentPath}` : '/', page: 1 },
    })
  }

  const data = results.data
  const hasQuery = Array.from(normalizedQuery).length >= 2
  return (
    <AppShell title="全局搜索">
      <header className={css.header}>
        <span className={css.eyebrow}>文件台账索引</span>
        <h1 className={css.title}>全局搜索</h1>
        <p className={css.description}>跨存储源查找文件名或路径，只显示你有权访问的内容。</p>
      </header>

      <form className={css.searchPanel} onSubmit={submit}>
        <label className={css.queryField}>
          <span className={css.srOnly}>搜索关键字</span>
          <IconSearch size={20} />
          <input
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
            ...(sources.data ?? []).map((source) => ({ value: source.key, label: source.name })),
          ]}
          leadingIcon={<IconServer size={17} />}
          leadingIconVariant="plain"
          disabled={sources.isPending}
        />
        <Button type="submit" disabled={Array.from(draftQuery.trim()).length < 2}>搜索</Button>
      </form>

      {!hasQuery ? (
        <section className={css.emptyState}>
          <span className={css.emptyIcon}><IconSearch size={28} /></span>
          <h2>从所有文件中查找</h2>
          <p>支持文件名和完整相对路径；回收站与排除路径不会出现在结果中。</p>
        </section>
      ) : results.isPending ? (
        <section className={css.emptyState} aria-busy="true">正在搜索索引…</section>
      ) : results.isError ? (
        <section className={css.emptyState} role="alert">
          <h2>搜索失败</h2>
          <p>{results.error instanceof ApiRequestError ? results.error.message : '请稍后重试。'}</p>
          <Button variant="secondary" onClick={() => results.refetch()}>重试</Button>
        </section>
      ) : data && data.total === 0 ? (
        <section className={css.emptyState}>
          <span className={css.emptyIcon}><IconFile size={28} /></span>
          <h2>没有找到匹配文件</h2>
          <p>尝试缩短关键字，或切换到其他存储源。</p>
        </section>
      ) : data ? (
        <section className={css.results} aria-labelledby="search-results-title">
          <div className={css.resultsHeader}>
            <div>
              <span className={css.resultCount}>{data.total}</span>
              <h2 id="search-results-title">个匹配结果</h2>
            </div>
            <span>第 {data.page} 页</span>
          </div>
          <div className={css.resultList}>
            {data.items.map((item) => (
              <article className={css.resultRow} key={`${item.source_key}:${item.path}`}>
                <span className={css.fileIcon}><IconFile size={20} /></span>
                <div className={css.fileIdentity}>
                  <a href={downloadFileUrl(item.source_key, `/${item.path}`)}>{item.name}</a>
                  <span>{item.source_name} · /{item.path}</span>
                </div>
                <div className={css.fileMeta}>
                  <span>{formatBytes(item.size)}</span>
                  <time dateTime={item.modified_at}>{formatDate(item.modified_at)}</time>
                </div>
                <div className={css.actions}>
                  <button type="button" onClick={() => openParent(item.source_key, item.parent_path)} title="打开所在目录">
                    <IconFolder size={16} />
                  </button>
                  <a href={downloadFileUrl(item.source_key, `/${item.path}`)} title={`下载 ${item.name}`}>
                    <IconDownload size={16} />
                  </a>
                </div>
              </article>
            ))}
          </div>
          <nav className={css.pagination} aria-label="搜索结果分页">
            <Button variant="secondary" disabled={data.page <= 1} onClick={() => changePage(data.page - 1)}>
              <IconChevronLeft size={15} /> 上一页
            </Button>
            <span>{data.page} / {Math.max(1, Math.ceil(data.total / data.page_size))}</span>
            <Button variant="secondary" disabled={!data.has_next} onClick={() => changePage(data.page + 1)}>
              下一页 <IconChevronRight size={15} />
            </Button>
          </nav>
        </section>
      ) : null}
    </AppShell>
  )
}
