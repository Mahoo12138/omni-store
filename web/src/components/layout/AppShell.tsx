import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, logout } from '../../api/auth'
import {
  IconChevronDown,
  IconFolder,
  IconImage,
  IconLogout,
  IconQuestion,
  IconSettings,
  LogoMark,
} from '../ui/Icon'
import * as css from './AppShell.css'

// 登录侧布局：桌面使用左侧导航，窄屏切为底部导航。
// 未登录自动跳转 /login；账号入口始终位于导航末端。
export function AppShell({
  title,
  children,
  wide = false,
}: {
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { pathname } = useLocation()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false, staleTime: 60_000 })

  useEffect(() => {
    if (me.isError) navigate({ to: '/login' })
  }, [me.isError, navigate])

  if (me.isPending) {
    return <AppShellLoading />
  }
  if (me.isError) {
    return null
  }
  const user = me.data

  async function onLogout() {
    await logout()
    queryClient.removeQueries({ queryKey: ['me'] })
    navigate({ to: '/login' })
  }

  const navItems = [
    { to: '/app', label: '文件', icon: <IconFolder />, active: pathname === '/app' || pathname.startsWith('/app/sources') },
    { to: '/app/image-bed', label: '图床', icon: <IconImage />, active: pathname.startsWith('/app/image-bed') },
  ]
  // 仅 super_admin 显示"系统设置"入口。
  const showAdmin = user.role === 'super_admin'
  const adminActive =
    pathname === '/app/admin' || pathname.startsWith('/app/admin/') || pathname.startsWith('/app/admin?')

  return (
    <div className={css.shell}>
      <aside className={css.sidebar}>
        <Link to="/app" className={css.brand}>
          <LogoMark size={30} />
          <span className={css.brandName}>OmniStore</span>
        </Link>
        <nav className={css.nav} aria-label="主导航">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={item.active ? css.navLinkActive : css.navLink}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          {showAdmin && (
            <Link
              to="/app/admin"
              className={adminActive ? css.navLinkActive : css.navLink}
              aria-current={adminActive ? 'page' : undefined}
            >
              <IconSettings />
              系统设置
            </Link>
          )}
        </nav>
        <div className={css.sidebarSpacer} />
        <UserMenu displayName={user.display_name} onLogout={onLogout} />
      </aside>

      <div className={css.content}>
        <main className={wide ? css.mainWide : css.main} aria-label={title}>{children}</main>
      </div>
    </div>
  )
}

function AppShellLoading() {
  return (
    <div className={css.loadingShell} aria-busy="true" aria-label="正在加载工作区">
      <div className={css.loadingSidebar} />
      <div className={css.loadingContent}>
        <div className={css.loadingBar} />
        <div className={css.loadingBlock} />
      </div>
    </div>
  )
}

// 侧栏底部用户菜单：桌面显示完整账号，窄屏收为底部导航入口。
function UserMenu({ displayName, onLogout }: { displayName: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const initial = displayName.slice(0, 1).toUpperCase()

  return (
    <div className={css.userMenu} ref={ref}>
      <button
        type="button"
        className={css.userMenuBtn}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`账号菜单：${displayName}`}
      >
        <span className={css.avatar}>{initial}</span>
        <span className={css.userIdentity}>
          <span className={css.userName}>{displayName}</span>
          <span className={css.userCaption}>账号与设置</span>
        </span>
        <IconChevronDown size={14} className={css.userChevron} />
      </button>
      {open && (
        <div role="menu" className={css.userDropdown}>
          <Link
            to="/app/admin"
            search={{ section: 'profile' }}
            role="menuitem"
            className={css.userDropdownItem}
            onClick={() => setOpen(false)}
          >
            <IconSettings size={16} />
            设置
          </Link>
          <Link
            to="/app/image-bed"
            role="menuitem"
            className={css.userDropdownItem}
            onClick={() => setOpen(false)}
          >
            <IconImage size={16} />
            图床
          </Link>
          <Link
            to="/about"
            role="menuitem"
            className={css.userDropdownItem}
            onClick={() => setOpen(false)}
          >
            <IconQuestion size={16} />
            使用帮助
          </Link>
          <div className={css.userDropdownDivider} />
          <button
            type="button"
            role="menuitem"
            className={css.userDropdownItem}
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
          >
            <IconLogout size={16} />
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}
