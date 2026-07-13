import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, logout } from '../../api/auth'
import { Button } from '../ui/Button'
import {
  IconChevronDown,
  IconFolder,
  IconImage,
  IconLogout,
  IconSearch,
  IconSettings,
  LogoMark,
} from '../ui/Icon'
import { formatBytes } from '../../utils/format'
import * as css from './AppShell.css'

// 登录侧布局（docs/home.png）：左侧白色侧栏 + 内容区顶栏。
// 未登录自动跳转 /login；<820px 时侧栏折叠为顶部横向导航。
export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { pathname } = useLocation()
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
            <Link key={item.to} to={item.to} className={item.active ? css.navLinkActive : css.navLink}>
              {item.icon}
              {item.label}
            </Link>
          ))}
          {showAdmin && (
            <Link
              to="/app/admin"
              className={adminActive ? css.navLinkActive : css.navLink}
            >
              <IconSettings />
              设置
            </Link>
          )}
        </nav>
        <div className={css.sidebarSpacer} />
        <span className={css.mobileUser}>
          <Button variant="ghost" onClick={onLogout} aria-label="退出登录">
            <IconLogout />
          </Button>
        </span>
        <QuotaCard />
      </aside>

      <div className={css.content}>
        <header className={css.topbar}>
          <h1 className={css.topbarTitle}>{title}</h1>
          <div className={css.topbarSpacer} />
          <div className={css.topbarSearch}>
            <span className={css.topbarSearchIcon}>
              <IconSearch size={16} />
            </span>
            <input
              className={css.topbarSearchInput}
              placeholder="搜索存储源、文件或功能"
              aria-label="全局搜索"
            />
            <span className={css.topbarKbd}>⌘K</span>
          </div>
          <UserMenu displayName={user.display_name} onLogout={onLogout} />
        </header>
        <main className={css.main}>{children}</main>
      </div>
    </div>
  )
}

// 配额卡：侧栏底部，固定显示 268.4 GB / 2 TB（设计稿示意值；后端无真实配额接口）。
function QuotaCard() {
  const used = 268.4
  const total = 2 * 1024 // 2 TB → GB
  const percent = Math.min(100, Math.round((used / total) * 100))
  return (
    <div className={css.quotaCard}>
      <div className={css.quotaHeader}>
        <span className={css.quotaTitle}>存储空间使用</span>
        <span className={css.quotaInfo} aria-label="说明">i</span>
      </div>
      <div className={css.quotaUsage}>
        {formatBytes(used * 1024 * 1024 * 1024)}
        <span className={css.quotaCapacity}> / {formatBytes(total * 1024 * 1024 * 1024)}</span>
      </div>
      <div className={css.quotaBar} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span className={css.quotaBarFill} style={{ width: `${percent}%` }} />
      </div>
      <div className={css.quotaMeta}>
        <span>{percent}%</span>
      </div>
      <button className={css.quotaLink} type="button">
        管理存储配额
      </button>
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
