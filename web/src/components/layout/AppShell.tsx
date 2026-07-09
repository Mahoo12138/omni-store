import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, logout } from '../../api/auth'
import { Button } from '../ui/Button'
import * as css from './AppShell.css'

// 登录用户侧统一布局。未登录自动跳转 /login。
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false, staleTime: 60_000 })

  if (me.isPending) {
    return null
  }
  if (me.isError) {
    navigate({ to: '/login' })
    return null
  }
  const user = me.data

  async function onLogout() {
    await logout()
    queryClient.removeQueries({ queryKey: ['me'] })
    navigate({ to: '/login' })
  }

  return (
    <div className={css.shell}>
      <header className={css.header}>
        <Link to="/app" className={css.logo}>
          OmniStore
        </Link>
        <nav className={css.nav}>
          <Link to="/app" className={css.navLink}>
            我的网盘
          </Link>
          <Link to="/app/image-bed" className={css.navLink}>
            图床
          </Link>
          <Link to="/app/settings" className={css.navLink}>
            设置
          </Link>
          {user.role === 'super_admin' && (
            <Link to="/admin" className={css.navLink}>
              管理后台
            </Link>
          )}
          <span className={css.userName}>{user.display_name}</span>
          <Button variant="secondary" onClick={onLogout}>
            退出
          </Button>
        </nav>
      </header>
      <main className={css.main}>{children}</main>
    </div>
  )
}
