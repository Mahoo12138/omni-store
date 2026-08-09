import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../../api/auth'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import * as css from '../../components/layout/AdminShell.css'

// 设置布局：复用 /app 侧栏 + 顶栏。个人设置对所有登录用户开放，
// 管理分区由页面和后端共同限制为超级管理员。
// 二级导航（概览/存储源/用户/审计日志/系统设置）已下沉到左侧边栏的
// "管理后台"分组里，这里只渲染页面内容。
export function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })

  if (me.isPending) return null
  if (me.isError) {
    navigate({ to: '/login' })
    return null
  }

  return <AppShell title={me.data?.role === 'super_admin' ? '管理后台' : '账号设置'}>{children}</AppShell>
}

// 子页面：标题 + 右上操作按钮
export function AdminPageHeader({
  title,
  actions,
}: {
  title: string
  actions?: ReactNode
}) {
  return (
    <div className={css.pageHeader}>
      <h1 className={css.pageTitle}>{title}</h1>
      {actions && <div className={css.pageActions}>{actions}</div>}
    </div>
  )
}

export function AdminPagePrimaryButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <Button variant="primary" onClick={onClick}>
      {children}
    </Button>
  )
}
