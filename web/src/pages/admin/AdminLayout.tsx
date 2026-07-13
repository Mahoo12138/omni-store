import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe } from '../../api/auth'
import { Button } from '../../components/ui/Button'
import { IconInfo, IconLogout, LogoMark } from '../../components/ui/Icon'
import * as css from '../../components/layout/AdminShell.css'

// tabs：管理员二级导航（docs/admin.png）
const tabs = [
  { to: '/admin', label: '概览' },
  { to: '/admin/sources', label: '存储源' },
  { to: '/admin/users', label: '用户' },
  { to: '/admin/audit-logs', label: '审计日志' },
  { to: '/admin/settings', label: '系统设置' },
] as const

function isTabActive(pathname: string, to: string) {
  if (to === '/admin') return pathname === '/admin' || pathname === '/admin/'
  return pathname === to || pathname.startsWith(to + '/')
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) {
      document.addEventListener('mousedown', onDocClick)
      return () => document.removeEventListener('mousedown', onDocClick)
    }
  }, [menuOpen])

  if (me.isPending) return null
  if (me.isError || me.data?.role !== 'super_admin') {
    navigate({ to: '/app' })
    return null
  }

  function onLogout() {
    setMenuOpen(false)
    // 清理本地缓存并跳转登录
    queryClient.clear()
    fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' })
      .catch(() => {})
      .finally(() => {
        navigate({ to: '/login' })
      })
  }

  const displayName = me.data.display_name
  const initial = (displayName || me.data.username || '?').slice(0, 1).toUpperCase()
  const isDisk = pathname === '/' || pathname.startsWith('/p')
  const isUpload = pathname.startsWith('/upload')
  const isAdmin = pathname.startsWith('/admin')
  const isAbout = pathname.startsWith('/about')

  return (
    <div className={css.shell}>
      {/* 顶栏 */}
      <header className={css.topbar}>
        <Link to="/" className={css.brand}>
          <LogoMark size={28} />
          <span className={css.brandName}>OmniStore</span>
        </Link>
        <nav className={css.nav} aria-label="主导航">
          <Link to="/" className={isDisk ? css.navLinkActive : css.navLink}>
            公开网盘
          </Link>
          <Link to="/upload" className={isUpload ? css.navLinkActive : css.navLink}>
            图床入口
          </Link>
          <Link to="/admin" className={isAdmin ? css.navLinkActive : css.navLink}>
            管理后台
          </Link>
          <Link to="/about" className={isAbout ? css.navLinkActive : css.navLink}>
            <IconInfo size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            关于我们
          </Link>
        </nav>
        <div className={css.right}>
          <div className={css.userMenu} ref={menuRef}>
            <button
              type="button"
              className={css.userMenuBtn}
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className={css.userAvatar}>{initial}</span>
              <span>{displayName || me.data.username}</span>
            </button>
            {menuOpen && (
              <div className={css.userDropdown} role="menu">
                <Link
                  to="/app"
                  className={css.userDropdownItem}
                  onClick={() => setMenuOpen(false)}
                >
                  我的存储源
                </Link>
                <Link
                  to="/app/settings"
                  className={css.userDropdownItem}
                  onClick={() => setMenuOpen(false)}
                >
                  个人设置
                </Link>
                <div className={css.userDropdownDivider} />
                <button
                  type="button"
                  className={css.userDropdownItem}
                  onClick={onLogout}
                >
                  <IconLogout size={16} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 二级导航 tabs */}
      <nav className={css.subnav} aria-label="管理导航">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={isTabActive(pathname, t.to) ? css.subnavLinkActive : css.subnavLink}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <main className={css.main}>{children}</main>
    </div>
  )
}

// 子页面：顶栏 + 内容 + 右上操作按钮
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
