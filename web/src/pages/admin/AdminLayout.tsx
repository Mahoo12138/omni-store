import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../../api/auth'
import { AppShell } from '../../components/layout/AppShell'
import * as css from '../../components/layout/AppShell.css'
import * as fm from '../FileManager.css'

// 管理后台布局：仅超级管理员可见（README §24.3）。
export function AdminLayout({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })

  if (me.isPending) return null
  if (me.isError || me.data.role !== 'super_admin') {
    navigate({ to: '/app' })
    return null
  }

  return (
    <AppShell>
      <nav className={css.nav}>
        <Link to="/admin" className={css.navLink}>
          存储源
        </Link>
        <Link to="/admin/users" className={css.navLink}>
          用户
        </Link>
        <Link to="/admin/audit-logs" className={css.navLink}>
          审计日志
        </Link>
        <Link to="/admin/settings" className={css.navLink}>
          系统设置
        </Link>
      </nav>
      <h1 className={fm.pageTitle}>{title}</h1>
      {children}
    </AppShell>
  )
}
