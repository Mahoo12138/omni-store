import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../../api/auth'
import { AppFrame } from '../../components/shell/AppFrame'

// 后台复用 /app 外壳。个人设置对所有登录用户开放，管理分区由页面和后端共同限制为
// 超级管理员；二级导航在侧栏"系统设置"入口内，这里只负责鉴权与渲染页面内容。
export function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })

  if (me.isPending) return null
  if (me.isError) {
    navigate({ to: '/login' })
    return null
  }

  return <AppFrame title={me.data?.role === 'super_admin' ? '管理后台' : '账号设置'}>{children}</AppFrame>
}
