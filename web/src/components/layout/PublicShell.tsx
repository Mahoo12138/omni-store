import type { ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAuthStatus } from '../../api/auth'
import { IconHome, IconInfo, LogoMark } from '../ui/Icon'
import * as css from './PublicShell.css'

// 公开侧布局（docs/index.png）：顶栏 = 品牌 / 中央导航 / 登录入口。
export function PublicShell({ children, showHeader = true }: { children: ReactNode; showHeader?: boolean }) {
  const { pathname } = useLocation()
  const authStatus = useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
    retry: false,
    staleTime: 60_000,
    enabled: showHeader,
  })
  const isDisk = pathname === '/' || pathname.startsWith('/p')
  const isUpload = pathname.startsWith('/upload')
  const isAbout = pathname.startsWith('/about')

  return (
    <div className={css.shell}>
      {showHeader && (
        <header className={`${css.header} ${css.headerResponsive}`}>
          <Link to="/" className={css.brand}>
            <LogoMark size={30} />
            <span className={css.brandName}>OmniStore</span>
          </Link>
          <nav className={css.nav} aria-label="主导航">
            <Link to="/" className={isDisk ? css.navLinkActive : css.navLink}>
              公开网盘
            </Link>
            <Link to="/upload" className={isUpload ? css.navLinkActive : css.navLink}>
              图床入口
            </Link>
            <Link to="/about" className={isAbout ? css.navLinkActive : css.navLink}>
              <IconInfo size={14} className={css.navLinkIcon} />
              关于我们
            </Link>
          </nav>
          {authStatus.isPending ? (
            <span className={css.authPlaceholder} aria-label="正在检查登录状态" />
          ) : authStatus.data?.authenticated ? (
            <Link to="/app" className={css.headerCta}>
              进入工作台
            </Link>
          ) : (
            <Link to="/login" className={css.headerCta}>
              登录
            </Link>
          )}
        </header>
      )}
      <main className={css.main}>{children}</main>
      <footer className={css.footer}>OmniStore · 自部署存储中心</footer>
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
