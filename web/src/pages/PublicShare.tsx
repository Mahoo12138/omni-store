import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import { browsePublicShare, fetchPublicShare, publicShareRawUrl, unlockPublicShare } from '../api/shares'
import { PublicShell } from '../components/layout/PublicShell'
import { FileTable } from '../components/files/FileTable'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { IconDownload, IconFile, IconFolder, IconKey, IconLink } from '../components/ui/Icon'
import { formatDate } from '../utils/format'
import * as ft from '../components/files/FileTable.css'
import * as css from './PublicShare.css'

export function PublicSharePage() {
  const { shareKey } = useParams({ from: '/s/$shareKey' })
  const search = useSearch({ from: '/s/$shareKey' })
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const info = useQuery({ queryKey: ['public-share', shareKey], queryFn: () => fetchPublicShare(shareKey), retry: false })

  const unlock = useMutation({
    mutationFn: () => unlockPublicShare(shareKey, password),
    onSuccess: async () => {
      setPasswordError('')
      await queryClient.invalidateQueries({ queryKey: ['public-share', shareKey] })
    },
    onError: (error) => setPasswordError(error instanceof ApiRequestError ? error.message : '验证失败，请重试。'),
  })

  if (info.isPending) return <PublicShell><div className={css.empty}>正在加载分享…</div></PublicShell>
  if (info.isError || !info.data) {
    return (
      <PublicShell>
        <div className={css.empty}>
          <span className={css.unlockIcon}><IconLink size={28} /></span>
          <h1>分享不存在或已失效</h1>
          <p>链接可能已被撤销、过期或达到下载次数上限。</p>
        </div>
      </PublicShell>
    )
  }

  if (info.data.protected && !info.data.access_granted) {
    return (
      <PublicShell>
        <div className={css.unlockWrap}>
          <section className={css.unlockCard}>
            <span className={css.unlockIcon}><IconKey size={28} /></span>
            <h1>此分享受密码保护</h1>
            <p>输入分享者提供的访问密码以查看「{info.data.name}」。</p>
            <form className={css.unlockForm} onSubmit={(event) => { event.preventDefault(); setPasswordError(''); unlock.mutate() }}>
              <Input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="访问密码" aria-label="访问密码" />
              {passwordError ? <span className={css.error} role="alert">{passwordError}</span> : null}
              <Button type="submit" disabled={unlock.isPending || !password}>{unlock.isPending ? '验证中…' : '查看分享'}</Button>
            </form>
          </section>
        </div>
      </PublicShell>
    )
  }

  return info.data.type === 'file'
    ? <PublicFile shareKey={shareKey} info={info.data} />
    : <PublicDirectory shareKey={shareKey} info={info.data} path={search.path} page={search.page} />
}

function PublicFile({ shareKey, info }: { shareKey: string; info: Awaited<ReturnType<typeof fetchPublicShare>> }) {
  return (
    <PublicShell>
      <ShareHero info={info}>
        <a className={css.linkButton} href={publicShareRawUrl(shareKey, '', true)}><IconDownload size={16} /> 下载文件</a>
      </ShareHero>
    </PublicShell>
  )
}

function PublicDirectory({ shareKey, info, path, page }: { shareKey: string; info: Awaited<ReturnType<typeof fetchPublicShare>>; path: string; page: number }) {
  const navigateRoute = useNavigate()
  const browse = useQuery({
    queryKey: ['public-share-browse', shareKey, path, page],
    queryFn: () => browsePublicShare(shareKey, path, page),
    retry: false,
  })
  const segments = useMemo(() => path.split('/').filter(Boolean), [path])

  function navigate(nextPath: string, nextPage = 1) {
    void navigateRoute({
      to: '/s/$shareKey',
      params: { shareKey },
      search: { path: nextPath, page: nextPage },
    })
  }

  return (
    <PublicShell>
      <ShareHero info={info} />
      <nav className={css.crumbs} aria-label="分享目录位置">
        <button className={css.crumbButton} onClick={() => navigate('')}>{info.name}</button>
        {segments.map((segment, index) => {
          const current = index === segments.length - 1
          return <span key={`${segment}-${index}`}> / {current ? <span className={css.currentCrumb}>{segment}</span> : <button className={css.crumbButton} onClick={() => navigate(segments.slice(0, index + 1).join('/'))}>{segment}</button>}</span>
        })}
      </nav>
      <FileTable
        entries={browse.isError ? [] : browse.data?.items}
        loading={browse.isPending}
        showType
        emptyTitle={browse.isError ? '目录不可访问' : '目录为空'}
        emptyHint={browse.isError ? '分享可能已经失效。' : undefined}
        onOpenDir={(name) => navigate([...segments, name].join('/'))}
        fileHref={(entry) => publicShareRawUrl(shareKey, [...segments, entry.name].join('/'))}
        renderActions={(entry) => entry.type === 'file' ? (
          <span className={ft.actions}><a className={ft.actionBtn} href={publicShareRawUrl(shareKey, [...segments, entry.name].join('/'), true)} title="下载" aria-label={`下载 ${entry.name}`}><IconDownload size={16} /></a></span>
        ) : null}
      />
      {browse.data && (browse.data.has_next || page > 1) ? (
        <div className={css.pager}>
          <span>共 {browse.data.total} 项</span>
          <Button variant="secondary" disabled={page <= 1} onClick={() => navigate(path, page - 1)}>上一页</Button>
          <Button variant="secondary" disabled={!browse.data.has_next} onClick={() => navigate(path, page + 1)}>下一页</Button>
        </div>
      ) : null}
    </PublicShell>
  )
}

function ShareHero({ info, children }: { info: Awaited<ReturnType<typeof fetchPublicShare>>; children?: React.ReactNode }) {
  const remaining = info.max_downloads > 0 ? Math.max(0, info.max_downloads - info.download_count) : null
  return (
    <header className={css.hero}>
      <div className={css.identity}>
        <span className={css.icon}>{info.type === 'dir' ? <IconFolder size={27} /> : <IconFile size={27} />}</span>
        <div style={{ minWidth: 0 }}>
          <h1 className={css.title}>{info.name}</h1>
          <div className={css.meta}>
            <span>{info.type === 'dir' ? '共享文件夹' : '共享文件'}</span>
            <span>{info.expires_at ? `有效至 ${formatDate(info.expires_at)}` : '长期有效'}</span>
            {remaining !== null ? <span>剩余 {remaining} 次下载</span> : null}
          </div>
        </div>
      </div>
      {children ? <div className={css.actions}>{children}</div> : null}
    </header>
  )
}
