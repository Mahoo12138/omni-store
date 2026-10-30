import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { validateTransferRedirect, validateTransferSearch } from './utils/transfer-workspace'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

// 公开侧（README §24.1）
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./pages/Home'), 'HomePage'),
})

const publicBrowseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/public/$',
  component: lazyRouteComponent(() => import('./pages/PublicBrowse'), 'PublicBrowsePage'),
})

const publicPickupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pickup/$publicKey',
  component: lazyRouteComponent(() => import('./pages/PublicPickup'), 'PublicPickupPage'),
})

const publicTransferRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/transfer',
  component: lazyRouteComponent(() => import('./pages/PublicTransfer'), 'PublicTransferPage'),
  validateSearch: validateTransferSearch,
})

const publicCollectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/collect/$publicKey',
  component: lazyRouteComponent(() => import('./pages/PublicCollect'), 'PublicCollectPage'),
})

const anonymousUploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upload',
  component: lazyRouteComponent(() => import('./pages/AnonymousUpload'), 'AnonymousUploadPage'),
})

interface PublicShareSearch {
  path: string
  page: number
}

const publicShareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/s/$shareKey',
  component: lazyRouteComponent(() => import('./pages/PublicShare'), 'PublicSharePage'),
  validateSearch: (search: Record<string, unknown>): PublicShareSearch => ({
    path: typeof search.path === 'string' ? search.path.replace(/^\/+|\/+$/g, '') : '',
    page: Number(search.page) >= 1 ? Number(search.page) : 1,
  }),
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: lazyRouteComponent(() => import('./pages/About'), 'AboutPage'),
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: lazyRouteComponent(() => import('./pages/Login'), 'LoginPage'),
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: validateTransferRedirect(search.redirect),
  }),
})

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: lazyRouteComponent(() => import('./pages/Setup'), 'SetupPage'),
})

// 登录用户侧（README §24.2）
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: lazyRouteComponent(() => import('./pages/AppHome'), 'AppHomePage'),
})

const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/favorites',
  component: lazyRouteComponent(() => import('./pages/Favorites'), 'FavoritesPage'),
})

interface FileManagerSearch {
  path: string
  page: number
}

const fileManagerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/sources/$sourceKey',
  component: lazyRouteComponent(() => import('./pages/FileManager'), 'FileManagerPage'),
  validateSearch: (search: Record<string, unknown>): FileManagerSearch => ({
    path: typeof search.path === 'string' && search.path ? search.path : '/',
    page: Number(search.page) >= 1 ? Number(search.page) : 1,
  }),
})

const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/sources/$sourceKey/trash',
  component: lazyRouteComponent(() => import('./pages/Trash'), 'TrashPage'),
})

const imageBedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/image-bed',
  component: lazyRouteComponent(() => import('./pages/ImageBed'), 'ImageBedPage'),
})

// 登录侧不再维护单独的「流转中心」：旧链接、书签与登录回跳一律并到公开页 /transfer，
// 登录身份在公开页同样生效（发件包仍可用「从已有文件添加」等需要登录的能力）。
const transferCenterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/transfer',
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/transfer', search })
  },
  validateSearch: validateTransferSearch,
})

const sharesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/shares',
  component: lazyRouteComponent(() => import('./pages/Shares'), 'SharesPage'),
})

// 设置（README §24.3）：两个真实路由共用一套布局与组件。
// - /app/settings 账户设置：所有登录用户（我的 / 偏好设置）
// - /app/admin    系统设置：仅超级管理员（仪表盘 / 存储源 / 策略 / 用户 / 审计 / 站点）
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/settings',
  component: lazyRouteComponent(() => import('./pages/admin/AdminOverview'), 'SettingsPage'),
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/admin',
  component: lazyRouteComponent(() => import('./pages/admin/AdminOverview'), 'AdminPage'),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  publicBrowseRoute,
  publicTransferRoute,
  publicPickupRoute,
  publicCollectRoute,
  anonymousUploadRoute,
  transferCenterRoute,
  publicShareRoute,
  aboutRoute,
  loginRoute,
  setupRoute,
  appRoute,
  favoritesRoute,
  fileManagerRoute,
  trashRoute,
  imageBedRoute,
  sharesRoute,
  settingsRoute,
  adminRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
