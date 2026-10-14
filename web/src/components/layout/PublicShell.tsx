import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSystemStatus } from '../../api/system'
import { IconHome, LogoMark } from '../ui/Icon'
import { PublicNavigation } from './PublicNavigation'
import * as css from './PublicShell.css'

// 公开侧布局：品牌与共享导航；独立 hero 也复用同一套导航。
// 品牌名来自实例品牌设置（1.2.0），未配置时回退 OmniStore。
export function PublicShell({ children, showHeader = true }: { children: ReactNode; showHeader?: boolean }) {
  const systemStatus = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    retry: false,
    staleTime: 5 * 60_000,
  })
  const instanceName = systemStatus.data?.instance_name?.trim() || 'OmniStore'

  return (
    <div className={css.shell}>
      {showHeader && (
        <header className={`${css.header} ${css.headerResponsive}`}>
          <Link to="/" className={css.brand}>
            <LogoMark size={30} />
            <span className={css.brandName}>{instanceName}</span>
          </Link>
          <PublicNavigation tone="light" />
        </header>
      )}
      <main className={css.main}>{children}</main>
      <footer className={css.footer}>{instanceName} · 自部署存储中心 · <Link to="/about">关于我们</Link></footer>
    </div>
  )
}

// 面包屑：docs/index.png 风格——首页图标 + 公开网盘 / 段 / 段 / 根目录
// onNavigate: 传相对路径（不包含 /p 前缀），空字符串代表回到首页 /
// rootLabel: 在根目录处显示的当前位置文案（默认 "根目录"）
export function PublicBreadcrumb({
  segments,
  onNavigate,
  showHome = true,
  rootLabel = '根目录',
}: {
  segments: string[]
  onNavigate: (path: string) => void
  showHome?: boolean
  rootLabel?: string
}) {
  return (
    <nav className={css.breadcrumb} aria-label="当前位置">
      {showHome && (
        <button
          className={css.crumbHome}
          onClick={() => onNavigate('')}
          aria-label="返回公开网盘首页"
          title="返回公开网盘首页"
        >
          <IconHome size={18} />
        </button>
      )}
      {segments.length === 0 ? (
        <span className={css.crumbGroup}>
          <span className={css.crumbSep}>/</span>
          <span className={css.crumbCurrent}>{rootLabel}</span>
        </span>
      ) : (
        <>
          <button className={css.crumbLink} onClick={() => onNavigate('')}>
            公开网盘
          </button>
          {segments.map((seg, i) => {
            const isLast = i === segments.length - 1
            return (
              <span key={i} className={css.crumbGroup}>
                <span className={css.crumbSep}>/</span>
                {isLast ? (
                  <span className={css.crumbCurrent}>{seg}</span>
                ) : (
                  <button
                    className={css.crumbLink}
                    onClick={() => onNavigate(segments.slice(0, i + 1).join('/'))}
                  >
                    {seg}
                  </button>
                )}
              </span>
            )
          })}
        </>
      )}
    </nav>
  )
}
