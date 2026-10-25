import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, logout } from '../../api/auth'
import { useFileClipboard } from '../files/FileClipboard'
import {
  IconActivity,
  IconChevronDown,
  IconFolder,
  IconCloud,
  IconImage,
  IconLink,
  IconLogout,
  IconQuestion,
  IconSearch,
  IconSettings,
  IconStar,
  LogoMark,
} from '../ui/Icon'
import { Menu, type MenuOption } from '../ui/Menu'
import { useStyles } from './AppShell.styles'

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
  const css = useStyles()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const clipboard = useFileClipboard()
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false, staleTime: 60_000 })

  useEffect(() => {
    if (me.isError && pathname.startsWith('/app')) navigate({ to: '/login', search: pathname === '/app/transfer' ? { redirect: '/app/transfer' } : {} })
  }, [me.isError, navigate, pathname])

  useEffect(() => {
    if (!window.matchMedia('(max-width: 820px)').matches) return
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [pathname, me.isSuccess])

  if (me.isPending) {
    return <AppShellLoading />
  }
  if (me.isError) {
    return null
  }
  const user = me.data

  async function onLogout() {
    clipboard.clear()
    await logout()
    queryClient.removeQueries({ queryKey: ['me'] })
    queryClient.removeQueries({ predicate: (query) => String(query.queryKey[0]).startsWith('transfer-') })
    queryClient.setQueryData(['auth-status'], { authenticated: false })
    navigate({ to: '/login' })
  }

  const navItems = [
    { to: '/app', label: '文件', icon: <IconFolder />, active: pathname === '/app' || pathname.startsWith('/app/sources') },
    { to: '/app/recent', label: '最近文件', icon: <IconActivity />, active: pathname.startsWith('/app/recent') },
    { to: '/app/favorites', label: '收藏', icon: <IconStar />, active: pathname.startsWith('/app/favorites') },
    { to: '/app/search', label: '搜索', icon: <IconSearch />, active: pathname.startsWith('/app/search') },
    { to: '/app/shares', label: '分享', icon: <IconLink />, active: pathname.startsWith('/app/shares') },
    { to: '/app/image-bed', label: '图床', icon: <IconImage />, active: pathname.startsWith('/app/image-bed') },
    { to: '/app/transfer', label: '流转', icon: <IconCloud />, active: pathname.startsWith('/app/transfer') },
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
        <nav ref={navRef} className={css.nav} aria-label="主导航">
          <span className={css.navLabel}>工作空间</span>
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: true }}
              className={item.active ? css.navLinkActive : css.navLink}
              aria-current={item.active ? 'page' : false}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          {showAdmin && (
            <Link
              to="/app/admin"
              className={adminActive ? css.navLinkActive : css.navLink}
              aria-current={adminActive ? 'page' : false}
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
  const css = useStyles()
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
  const css = useStyles()
  const navigate = useNavigate()
  const initial = displayName.slice(0, 1).toUpperCase()

  const items: MenuOption[] = [
    {
      id: 'settings',
      label: '设置',
      icon: <IconSettings size={16} />,
      onSelect: () => navigate({ to: '/app/admin', search: { section: 'profile' } }),
    },
    {
      id: 'image-bed',
      label: '图床',
      icon: <IconImage size={16} />,
      onSelect: () => navigate({ to: '/app/image-bed' }),
    },
    {
      id: 'about',
      label: '使用帮助',
      icon: <IconQuestion size={16} />,
      onSelect: () => navigate({ to: '/about' }),
    },
    {
      id: 'logout',
      label: '退出登录',
      icon: <IconLogout size={16} />,
      danger: true,
      onSelect: onLogout,
    },
  ]

  return (
    <Menu
      ariaLabel={`账号菜单：${displayName}`}
      trigger={
        <>
          <span className={css.avatar}>{initial}</span>
          <span className={css.userIdentity}>
            <span className={css.userName}>{displayName}</span>
            <span className={css.userCaption}>账号与设置</span>
          </span>
          <IconChevronDown size={14} className={css.userChevron} />
        </>
      }
      triggerClassName={css.userMenuBtn}
      items={items}
    />
  )
}
