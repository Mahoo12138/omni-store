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

// 登录侧布局（docs/home.png）：左侧白色侧栏 + 内容区顶栏。
// 未登录自动跳转 /login；<820px 时侧栏折叠为顶部横向导航。
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
        <button className={css.mobileUser} type="button" onClick={onLogout} aria-label="退出登录">
          <IconLogout size={18} />
        </button>
        <div className={css.sidebarMeta}>
          <span>自托管存储</span>
          <span>数据留在你的设备</span>
        </div>
      </aside>

      <div className={css.content}>
        <header className={css.topbar}>
          <div className={css.topbarTitle}>{title}</div>
          <div className={css.topbarSpacer} />
          <Link to="/about" className={css.helpLink}>
            <IconQuestion size={16} />
            使用帮助
          </Link>
          <UserMenu displayName={user.display_name} onLogout={onLogout} />
        </header>
        <main className={wide ? css.mainWide : css.main}>{children}</main>
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

// 顶栏右上角用户菜单：头像 + 名 + 下拉，点击展开操作。
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
    <div className={css.userMenu} ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className={css.userMenuBtn}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={css.avatar}>{initial}</span>
        <span className={css.userName}>{displayName}</span>
        <IconChevronDown size={14} />
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
