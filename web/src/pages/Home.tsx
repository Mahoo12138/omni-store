import { useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAuthStatus, fetchSetupStatus } from '../api/auth'
import { fetchPublicMounts } from '../api/public'
import { PublicShell } from '../components/layout/PublicShell'
import {
  EntryIcon,
  IconChevronRight,
  IconFolderFilled,
  IconImage,
  LogoMark,
} from '../components/ui/Icon'
import * as ft from '../components/files/FileTable.css'
import * as css from './Home.css'

// 公开网盘首页：去除全局顶栏，以公开目录索引作为唯一主任务。
export function HomePage() {
  const navigate = useNavigate()
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: fetchSetupStatus })
  const mounts = useQuery({ queryKey: ['public-mounts'], queryFn: fetchPublicMounts })
  const authStatus = useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
    retry: false,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (setup.data && !setup.data.initialized) {
      navigate({ to: '/setup' })
    }
  }, [setup.data, navigate])

  const mountCount = mounts.data?.length ?? 0

  function openMount(path: string) {
    navigate({
      to: '/p/$',
      params: { _splat: path.replace(/^\//, '') },
    })
  }

  return (
    <PublicShell showHeader={false}>
      <section className={css.archiveHero} aria-labelledby="public-drive-title">
        <div className={css.masthead}>
          <Link to="/" className={css.brand} aria-label="OmniStore 公开网盘首页">
            <LogoMark size={32} />
            <span>
              <strong>OmniStore</strong>
              <small>PUBLIC DRIVE</small>
            </span>
          </Link>
          <div className={css.utilityLinks}>
            <Link to="/upload" className={css.imageBedLink}>
              <IconImage size={16} />
              匿名图床
            </Link>
            {authStatus.isPending ? (
              <span className={css.authPlaceholder} aria-label="正在检查登录状态" />
            ) : authStatus.data?.authenticated ? (
              <Link to="/app" className={css.authLink}>进入工作台</Link>
            ) : (
              <Link to="/login" className={css.authLink}>管理登录</Link>
            )}
          </div>
        </div>

        <div className={css.heroBody}>
          <div className={css.heroCopy}>
            <span className={css.sectionLabel}>自部署公开文件索引</span>
            <h1 id="public-drive-title">公开网盘</h1>
            <p>这里收录此实例开放共享的目录。选择一个目录，即可浏览或下载其中的文件。</p>
          </div>
          <div className={css.directoryCount} aria-live="polite">
            <strong>
              {mounts.isPending ? '··' : mounts.isError ? '—' : String(mountCount).padStart(2, '0')}
            </strong>
            <span>{mounts.isError ? '目录暂不可用' : '个公开目录'}</span>
          </div>
        </div>
      </section>

      <section className={css.directorySection} aria-labelledby="directory-index-title">
        <header className={css.directoryHeader}>
          <div>
            <span className={css.indexNumber}>01</span>
            <h2 id="directory-index-title">目录索引</h2>
          </div>
          <p>选择目录开始浏览</p>
        </header>

        <div className={`${ft.tableWrap} ${css.directoryPanel}`}>
          {mounts.isPending && (
            <div className={css.loadingState} aria-busy="true" aria-label="正在加载公开目录">
              <div className={ft.skeletonRow} />
              <div className={ft.skeletonRow} />
              <div className={ft.skeletonRow} />
            </div>
          )}
          {mounts.isSuccess && mounts.data.length === 0 && (
            <div className={css.emptyState}>
              <span className={css.emptyIcon} aria-hidden="true">
                <IconFolderFilled size={30} />
              </span>
              <div>
                <h2>等待第一个公开目录</h2>
                <p>管理员为存储源启用公开挂载后，文件入口会出现在这里。</p>
              </div>
            </div>
          )}
          {mounts.isError && (
            <div className={css.errorState} role="alert">
              <div>
                <h2>无法读取公开目录</h2>
                <p>请检查网络连接后重新加载。</p>
              </div>
              <button type="button" onClick={() => mounts.refetch()}>重新加载目录</button>
            </div>
          )}
          {mounts.isSuccess && mounts.data.length > 0 && (
            <table className={`${ft.table} ${css.directoryTable}`}>
              <thead>
                <tr>
                  <th className={ft.th}>目录名称</th>
                  <th className={ft.th}>公开路径</th>
                  <th className={ft.th}>说明</th>
                  <th className={css.openHeading} aria-label="打开目录" />
                </tr>
              </thead>
              <tbody>
                {mounts.data.map((mount) => (
                  <tr key={mount.mount_path} className={`${ft.row} ${css.directoryRow}`}>
                    <td className={ft.nameCell}>
                      <span className={ft.nameInner}>
                        <EntryIcon name={mount.name} type="dir" size={30} />
                        <button className={ft.nameLink} onClick={() => openMount(mount.mount_path)}>
                          {mount.name}
                        </button>
                      </span>
                    </td>
                    <td className={ft.td}><code className={css.path}>{mount.mount_path}</code></td>
                    <td className={ft.td}>{mount.description || '未添加说明'}</td>
                    <td className={css.openCell}>
                      <button
                        type="button"
                        onClick={() => openMount(mount.mount_path)}
                        aria-label={`打开目录 ${mount.name}`}
                      >
                        <IconChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </PublicShell>
  )
}
