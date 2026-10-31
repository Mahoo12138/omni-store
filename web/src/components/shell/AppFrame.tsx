import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
  Button,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Menu as FluentMenu,
  Nav,
  NavItem as FluentNavItem,
  NavSectionHeader,
  MenuDivider,
  MenuItem,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  OverlayDrawer,
} from '@fluentui/react-components'
import { fetchMe, logout } from '../../api/auth'
import { useFileClipboard } from '../files/FileClipboard'
import { SearchDialog, openSearchDialog } from '../search/SearchDialog'
import { THEME_MENU_LABEL, THEME_MENU_RADIO_NAME, THEME_OPTIONS } from '../theme/themeOptions'
import { isThemeMode } from '../../utils/themeMode'
import { setThemeMode, useTheme } from '../../utils/useTheme'
import {
  IconChevronDown,
  IconClose,
  IconFolder,
  IconImage,
  IconLink,
  IconLogout,
  IconQuestion,
  IconSettings,
  IconUser,
  IconStar,
  LogoMark,
} from '../ui/Icon'
import { ItemView, type MenuOption } from '../ui/Menu'
import { useAppFrameStyles } from './AppFrame.styles'

export interface AppFrameNavItem {
  to: string
  label: string
  /** Fluent NavItem 的 icon 槽要求元素（不是任意 ReactNode）。 */
  icon: ReactElement
  active: boolean
}

// 登录侧外壳：桌面左侧导航，窄屏切为底部导航条。
// 未登录自动跳转 /login；账号入口始终位于导航末端。
export function AppFrame({
  title,
  children,
  wide = false,
}: {
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const css = useAppFrameStyles()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const clipboard = useFileClipboard()
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false, staleTime: 60_000 })

  useEffect(() => {
    if (me.isError && pathname.startsWith('/app')) navigate({ to: '/login' })
  }, [me.isError, navigate, pathname])

  // 抽屉只服务窄屏；路由变化后无论点哪一项都收起。
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // 全局搜索:⌘K / Ctrl+K 在任意登录页呼出。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openSearchDialog()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (me.isPending) return <AppFrameLoading />
  if (me.isError) return null
  const user = me.data

  async function onLogout() {
    clipboard.clear()
    await logout()
    queryClient.removeQueries({ queryKey: ['me'] })
    queryClient.setQueryData(['auth-status'], { authenticated: false })
    navigate({ to: '/login' })
  }

  function goTo(to: string) {
    setDrawerOpen(false)
    navigate({ to })
  }

  const navItems: AppFrameNavItem[] = [
    { to: '/app', label: '文件', icon: <IconFolder />, active: pathname === '/app' || pathname.startsWith('/app/sources') },
    { to: '/app/favorites', label: '收藏', icon: <IconStar />, active: pathname.startsWith('/app/favorites') },
    { to: '/app/shares', label: '分享', icon: <IconLink />, active: pathname.startsWith('/app/shares') },
    { to: '/app/image-bed', label: '图床', icon: <IconImage />, active: pathname.startsWith('/app/image-bed') },
  ]
  // Nav 用 value 判定选中态；active 的分组规则（如 /app/sources 也算「文件」）在这里折算。
  const selectedNav = navItems.find((item) => item.active)?.to ?? ''
  // 抽屉里的账户入口也要有选中态：设置页不属于主导航，回落到对应设置路由。
  const drawerSelectedNav = selectedNav
    || (pathname.startsWith('/app/settings') ? '/app/settings'
      : pathname.startsWith('/app/admin') ? '/app/admin'
        : pathname.startsWith('/about') ? '/about' : '')
  // 设置页（账户设置 / 系统设置）把主侧栏收成图标窄栏，
  // 腾出的横向空间给「设置分组」面板（紧贴窄栏）。
  const compact =
    pathname === '/app/admin' || pathname.startsWith('/app/admin/') ||
    pathname === '/app/settings' || pathname.startsWith('/app/settings/')

  return (
    <div className={css.root}>
      {/* ≤820：主侧栏与底部导航都退场，改为 logo 抽屉 + 头像菜单的顶部栏。 */}
      <header className={css.mobileHeader}>
        <Button
          appearance="subtle"
          className={css.mobileBrandButton}
          aria-label="打开导航"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <span className={css.mobileBrandRow}>
            <LogoMark size={26} />
            <span className={css.mobileBrandName}>OmniStore</span>
          </span>
        </Button>
        <UserMenu
          displayName={user.display_name}
          showAdminEntry={user.role === 'super_admin'}
          compact
          header
          onLogout={onLogout}
        />
      </header>

      <aside className={css.sidebar} data-compact={compact ? '' : undefined}>
        <Link
          to="/app"
          className={css.brand}
          data-compact={compact ? '' : undefined}
          aria-label={compact ? 'OmniStore' : undefined}
        >
          <LogoMark size={30} />
          {compact ? null : <span className={css.brandName}>OmniStore</span>}
        </Link>
        <nav className={css.nav} aria-label="主导航">
          {compact ? null : <NavSectionHeader as="div" className={css.navLabel}>工作空间</NavSectionHeader>}
          <Nav selectedValue={selectedNav} className={css.navList}>
            {navItems.map((item) => (
              <FluentNavItem
                key={item.to}
                value={item.to}
                href={item.to}
                icon={item.icon}
                className={css.navListItem}
                data-compact={compact ? '' : undefined}
                // 窄栏不渲染文字，可访问名与悬停提示改由这两个属性承担。
                aria-label={compact ? item.label : undefined}
                title={compact ? item.label : undefined}
                aria-current={item.active ? 'page' : undefined}
                onClick={(event) => {
                  // href 保留中键 / ⌘ 点击的新标签语义，左键走客户端跳转。
                  if (event.metaKey || event.ctrlKey || event.button !== 0) return
                  event.preventDefault()
                  navigate({ to: item.to })
                }}
              >
                {compact ? null : item.label}
              </FluentNavItem>
            ))}
          </Nav>
        </nav>
        <div className={css.sidebarSpacer} />
        <UserMenu
          displayName={user.display_name}
          showAdminEntry={user.role === 'super_admin'}
          compact={compact}
          onLogout={onLogout}
        />
      </aside>

      <div className={css.content}>
        <main
          className={compact ? css.mainFlush : wide ? css.mainWide : css.main}
          aria-label={title}
        >{children}</main>
      </div>

      <OverlayDrawer
        open={drawerOpen}
        onOpenChange={(_, data) => setDrawerOpen(data.open)}
        position="start"
        size="small"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={(
              <Button
                appearance="subtle"
                aria-label="关闭导航"
                icon={<IconClose size={20} />}
                onClick={() => setDrawerOpen(false)}
              />
            )}
          >
            <span className={css.mobileDrawerBrand}>
              <LogoMark size={24} />
              <span>OmniStore</span>
            </span>
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <nav className={css.mobileDrawerNav} aria-label="主导航">
            <Nav selectedValue={drawerSelectedNav}>
              <NavSectionHeader as="div">工作空间</NavSectionHeader>
              {navItems.map((item) => (
                <FluentNavItem
                  key={item.to}
                  value={item.to}
                  href={item.to}
                  icon={item.icon}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.button !== 0) return
                    event.preventDefault()
                    goTo(item.to)
                  }}
                >
                  {item.label}
                </FluentNavItem>
              ))}
              <NavSectionHeader as="div">账户</NavSectionHeader>
              <FluentNavItem
                value="/app/settings"
                href="/app/settings"
                icon={<IconUser size={20} />}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.button !== 0) return
                  event.preventDefault()
                  goTo('/app/settings')
                }}
              >
                账户设置
              </FluentNavItem>
              {user.role === 'super_admin' ? (
                <FluentNavItem
                  value="/app/admin"
                  href="/app/admin"
                  icon={<IconSettings size={20} />}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.button !== 0) return
                    event.preventDefault()
                    goTo('/app/admin')
                  }}
                >
                  系统设置
                </FluentNavItem>
              ) : null}
              <FluentNavItem
                value="/about"
                href="/about"
                icon={<IconQuestion size={20} />}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.button !== 0) return
                  event.preventDefault()
                  goTo('/about')
                }}
              >
                使用帮助
              </FluentNavItem>
            </Nav>
          </nav>
        </DrawerBody>
      </OverlayDrawer>

      <SearchDialog />
    </div>
  )
}

function AppFrameLoading() {
  const css = useAppFrameStyles()
  return (
    <div className={css.root} aria-busy="true" aria-label="正在加载工作区">
      <div className={css.loadingSidebar} />
      <div className={css.loadingContent} />
    </div>
  )
}

// 侧栏底部账号菜单：桌面显示完整账号，窄屏收为底部导航末端的一个图标。
function UserMenu({
  displayName,
  showAdminEntry,
  compact,
  header = false,
  onLogout,
}: {
  displayName: string
  /** super_admin 才有；系统设置已从侧栏移到这里。 */
  showAdminEntry: boolean
  /** 窄栏态：只留头像，文字与箭头不渲染。 */
  compact: boolean
  /** 移动端顶栏：40px 方形头像按钮，不套侧栏用户区的边框。 */
  header?: boolean
  onLogout: () => void
}) {
  const css = useAppFrameStyles()
  const navigate = useNavigate()
  const { mode } = useTheme()
  // 入口图标跟随当前档位，未展开也能看出现在是哪一档。
  const ModeIcon = (THEME_OPTIONS.find((option) => option.value === mode) ?? THEME_OPTIONS[0]).icon

  const items: MenuOption[] = [
    // 两个设置是两个真实路由：账户设置（所有人）/ 系统设置（仅管理员）。
    // 「图床」侧栏已有入口，不在菜单里重复。
    { id: 'settings', label: '账户设置', icon: <IconUser size={16} />, onSelect: () => navigate({ to: '/app/settings' }) },
    ...(showAdminEntry
      ? [{ id: 'admin', label: '系统设置', icon: <IconSettings size={16} />, onSelect: () => navigate({ to: '/app/admin' }) }]
      : []),
    { id: 'about', label: '使用帮助', icon: <IconQuestion size={16} />, onSelect: () => navigate({ to: '/about' }) },
  ]
  const logoutItem: MenuOption = {
    id: 'logout',
    label: '退出登录',
    icon: <IconLogout size={16} />,
    danger: true,
    onSelect: onLogout,
  }

  return (
    <div className={header ? css.mobileUserArea : css.userArea}>
      <FluentMenu hasIcons>
        <MenuTrigger>
          {header ? (
            <Button
              appearance="subtle"
              className={css.mobileAvatarButton}
              aria-label={`账号菜单：${displayName}`}
            >
              <Avatar name={displayName} initials={displayName.slice(0, 1)} size={32} color="brand" />
            </Button>
          ) : (
            /*
              头像不能走 Button 的 icon 槽：Fluent 把该槽钉死为 20×20，32px 的 Avatar
              会被压扁。renderButton 直接把 children 放进 root，所以整行自己排布。
            */
            <Button
              appearance="subtle"
              className={css.userButton}
              data-compact={compact ? '' : undefined}
              aria-label={`账号菜单：${displayName}`}
            >
              <span className={css.userRow} data-compact={compact ? '' : undefined}>
                <Avatar name={displayName} initials={displayName.slice(0, 1)} size={32} color="brand" />
                {compact ? null : (
                  <>
                    <span className={css.userStack}>
                      <span className={css.userName}>{displayName}</span>
                    </span>
                    <IconChevronDown size={12} className={css.userChevron} />
                  </>
                )}
              </span>
            </Button>
          )}
        </MenuTrigger>
        <MenuPopover>
          <MenuList aria-label={`账号菜单：${displayName}`}>
            {items.map((item) => (
              <ItemView key={item.id} item={item} />
            ))}
            {/* 外观档位收进二级弹出层：主菜单只留一个入口，勾选态由内层 Menu 自己管。 */}
            <FluentMenu
              hasCheckmarks
              checkedValues={{ [THEME_MENU_RADIO_NAME]: [mode] }}
              onCheckedValueChange={(_, data) => {
                const [next] = data.checkedItems
                if (isThemeMode(next)) setThemeMode(next)
              }}
            >
              <MenuTrigger disableButtonEnhancement>
                <MenuItem hasSubmenu icon={<ModeIcon size={16} />}>{THEME_MENU_LABEL}</MenuItem>
              </MenuTrigger>
              <MenuPopover>
                <MenuList aria-label={THEME_MENU_LABEL}>
                  {THEME_OPTIONS.map((option) => (
                    <MenuItemRadio
                      key={option.value}
                      name={THEME_MENU_RADIO_NAME}
                      value={option.value}
                      icon={<option.icon size={16} />}
                    >
                      {option.label}
                    </MenuItemRadio>
                  ))}
                </MenuList>
              </MenuPopover>
            </FluentMenu>
            <MenuDivider />
            <ItemView item={logoutItem} />
          </MenuList>
        </MenuPopover>
      </FluentMenu>
    </div>
  )
}
