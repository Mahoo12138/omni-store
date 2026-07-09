import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { browsePublic, rawUrl } from '../api/public'
import { formatBytes, formatDate } from '../utils/format'
import * as css from './FileManager.css'
import * as homeCss from './Home.css'

// 公开目录浏览页 /p/*（README §12.5）。
export function PublicBrowsePage() {
  const location = useLocation()
  const navigate = useNavigate()
  // /p/photos/2026 -> photos/2026
  const virtualPath = decodeURIComponent(location.pathname.replace(/^\/p\/?/, ''))

  const browse = useQuery({
    queryKey: ['public-browse', virtualPath],
    queryFn: () => browsePublic('/' + virtualPath),
    enabled: virtualPath !== '',
  })

  const crumbs = virtualPath.split('/').filter(Boolean)

  function goTo(p: string) {
    navigate({ to: '/p/$', params: { _splat: p } })
  }

  return (
    <div className={homeCss.page}>
      <header className={homeCss.header}>
        <Link to="/" className={homeCss.logo}>
          OmniStore
        </Link>
        <nav className={homeCss.headerNav}>
          <Link to="/login">登录</Link>
        </nav>
      </header>
      <main className={homeCss.main}>
        <div className={css.toolbar}>
          <nav className={css.breadcrumb}>
            <Link to="/" className={css.crumbLink}>
              公开网盘
            </Link>
            {crumbs.map((seg, i) => (
              <span key={i}>
                {' / '}
                <button
                  className={css.crumbLink}
                  onClick={() => goTo(crumbs.slice(0, i + 1).join('/'))}
                >
                  {seg}
                </button>
              </span>
            ))}
          </nav>
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
              {browse.data?.items.map((entry) => {
                const childVirtual = `${virtualPath}/${entry.name}`
                return (
                  <tr key={entry.name}>
                    <td className={css.nameCell}>
                      {entry.type === 'dir' ? (
                        <button className={css.rowLink} onClick={() => goTo(childVirtual)}>
                          📁 {entry.name}
                        </button>
                      ) : (
                        <a
                          className={css.rowLink}
                          href={rawUrl(childVirtual)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📄 {entry.name}
                        </a>
                      )}
                    </td>
                    <td className={css.td}>
                      {entry.type === 'file' ? formatBytes(entry.size) : '-'}
                    </td>
                    <td className={css.td}>{formatDate(entry.mtime)}</td>
                    <td className={css.td}>
                      {entry.type === 'file' && (
                        <a className={css.actionBtn} href={rawUrl(childVirtual, true)}>
                          下载
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {browse.isSuccess && browse.data.items.length === 0 && (
            <div className={css.empty}>目录为空</div>
          )}
          {browse.isError && <div className={css.empty}>路径不存在或不可访问</div>}
        </div>
      </main>
    </div>
  )
}
