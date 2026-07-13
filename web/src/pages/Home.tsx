import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSetupStatus } from '../api/auth'
import { fetchPublicMounts } from '../api/public'
import { PublicBreadcrumb, PublicShell } from '../components/layout/PublicShell'
import { EntryIcon } from '../components/ui/Icon'
import * as ft from '../components/files/FileTable.css'

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

  return (
    <PublicShell>
      <PublicBreadcrumb segments={[]} onNavigate={() => {}} />
      <div className={ft.tableWrap}>
        <table className={ft.table}>
          <thead>
            <tr>
              <th className={ft.th}>名称</th>
              <th className={ft.th}>挂载路径</th>
              <th className={ft.th}>说明</th>
            </tr>
          </thead>
          <tbody>
            {mounts.data?.map((m) => (
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
        {mounts.isPending && (
          <div aria-busy="true" aria-label="加载中">
            <div className={ft.skeletonRow} />
            <div className={ft.skeletonRow} />
          </div>
        )}
        {mounts.isSuccess && mounts.data.length === 0 && (
          <div className={ft.empty}>
            <div className={ft.emptyTitle}>还没有公开的目录</div>
            <div>管理员在后台为存储源配置公开挂载后，会出现在这里。</div>
          </div>
        )}
        {mounts.isError && (
          <div className={ft.empty}>
            <div className={ft.emptyTitle}>加载失败</div>
            <div>请刷新页面重试。</div>
          </div>
        )}
      </div>
    </PublicShell>
  )
}
