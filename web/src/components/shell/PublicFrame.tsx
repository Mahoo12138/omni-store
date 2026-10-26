import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSystemStatus } from '../../api/system'
import { PublicNavigation } from '../layout/PublicNavigation'
import { LogoMark } from '../ui/Icon'
import { usePublicFrameStyles } from './PublicFrame.styles'

// 公开侧唯一外壳。品牌名取实例品牌设置，未配置时回退 OmniStore。
export function PublicFrame({ children }: { children: ReactNode }) {
  const css = usePublicFrameStyles()
  const systemStatus = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    retry: false,
    staleTime: 5 * 60_000,
  })
  const instanceName = systemStatus.data?.instance_name?.trim() || 'OmniStore'

  return (
    <div className={css.root}>
      <header className={css.topBar}>
        <Link to="/" className={css.brand} aria-label={`返回 ${instanceName} 公开网盘`}>
          <LogoMark size={32} />
          <span className={css.brandName}>{instanceName}</span>
        </Link>
        <PublicNavigation />
      </header>
      <main className={css.main}>{children}</main>
      <footer className={css.footer}>
        {instanceName} · 自部署存储中心 · <Link to="/about" className={css.footerLink}>关于我们</Link>
      </footer>
    </div>
  )
}
