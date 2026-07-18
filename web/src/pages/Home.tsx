import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSetupStatus } from '../api/auth'
import { fetchPublicMounts } from '../api/public'
import { PublicBreadcrumb, PublicShell } from '../components/layout/PublicShell'
import { EntryIcon, IconFolderFilled } from '../components/ui/Icon'
import * as ft from '../components/files/FileTable.css'
import * as css from './Home.css'

// 公开网盘首页 /（docs/index.png）：根目录列出全部公开挂载。
// 首次启动未初始化时引导到 /setup。
export function HomePage() {
  const navigate = useNavigate()
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: fetchSetupStatus })
  const mounts = useQuery({ queryKey: ['public-mounts'], queryFn: fetchPublicMounts })

  useEffect(() => {
    if (setup.data && !setup.data.initialized) {
      navigate({ to: '/setup' })
    }
  }, [setup.data, navigate])

  const mountCount = mounts.data?.length ?? 0

  return (
    <PublicShell>
      <section className={css.hero} aria-labelledby="public-files-title">
        <div className={css.heroCopy}>
          <h1 id="public-files-title">公开文件</h1>
          <p>浏览此实例对外开放的目录，直接查看和下载共享内容。</p>
        </div>
        <div className={css.heroAside}>
          <span className={css.heroIcon} aria-hidden="true">
            <IconFolderFilled size={32} />
          </span>
          <span className={css.heroStatus} aria-live="polite">
            {mounts.isPending
              ? '正在读取公开目录'
              : mounts.isError
                ? '目录状态暂不可用'
                : `${mountCount} 个公开目录`}
          </span>
        </div>
      </section>

      <div className={css.locationBar}>
        <PublicBreadcrumb segments={[]} onNavigate={() => {}} rootLabel="公开目录" />
        {mounts.isSuccess && mountCount > 0 && (
          <span className={css.locationMeta}>{mountCount} 个目录</span>
        )}
      </div>

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
              <IconFolderFilled size={32} />
            </span>
            <div>
              <h2>还没有公开目录</h2>
              <p>管理员为存储源启用公开挂载后，目录会显示在这里。</p>
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
          <table className={ft.table}>
            <thead>
              <tr>
                <th className={ft.th}>名称</th>
                <th className={ft.th}>挂载路径</th>
                <th className={ft.th}>说明</th>
              </tr>
            </thead>
            <tbody>
              {mounts.data.map((m) => (
                <tr key={m.mount_path} className={ft.row}>
                  <td className={ft.nameCell}>
                    <span className={ft.nameInner}>
                      <EntryIcon name={m.name} type="dir" />
                      <button
                        className={ft.nameLink}
                        onClick={() =>
                          navigate({
                            to: '/p/$',
                            params: { _splat: m.mount_path.replace(/^\//, '') },
                          })
                        }
                      >
                        {m.name}
                      </button>
                    </span>
                  </td>
                  <td className={ft.td}>{m.mount_path}</td>
                  <td className={ft.td}>{m.description || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PublicShell>
  )
}
