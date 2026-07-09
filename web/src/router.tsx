import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { HomePage } from './pages/Home'
import { LoginPage } from './pages/Login'
import { SetupPage } from './pages/Setup'
import { AppHomePage } from './pages/AppHome'
import { FileManagerPage } from './pages/FileManager'
import { PublicBrowsePage } from './pages/PublicBrowse'
import { AnonymousUploadPage } from './pages/AnonymousUpload'
import { ImageBedPage } from './pages/ImageBed'
import { SettingsPage } from './pages/Settings'
import { AdminSourcesPage } from './pages/admin/AdminSources'
import { AdminUsersPage } from './pages/admin/AdminUsers'
import { AdminAuditPage } from './pages/admin/AdminAudit'
import { AdminSettingsPage } from './pages/admin/AdminSettings'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

// 公开侧（README §24.1）
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const publicBrowseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$',
  component: PublicBrowsePage,
})

const anonymousUploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upload',
  component: AnonymousUploadPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupPage,
})

// 登录用户侧（README §24.2）
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: AppHomePage,
})

interface FileManagerSearch {
  path: string
  page: number
}

const fileManagerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/sources/$sourceId',
  component: FileManagerPage,
  validateSearch: (search: Record<string, unknown>): FileManagerSearch => ({
    path: typeof search.path === 'string' && search.path ? search.path : '/',
    page: Number(search.page) >= 1 ? Number(search.page) : 1,
  }),
})

const imageBedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/image-bed',
  component: ImageBedPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/settings',
  component: SettingsPage,
})

// 管理员侧（README §24.3）
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminSourcesPage,
})

const adminUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/users',
  component: AdminUsersPage,
})

const adminAuditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/audit-logs',
  component: AdminAuditPage,
})

const adminSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/settings',
  component: AdminSettingsPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  publicBrowseRoute,
  anonymousUploadRoute,
  loginRoute,
  setupRoute,
  appRoute,
  fileManagerRoute,
  imageBedRoute,
  settingsRoute,
  adminRoute,
  adminUsersRoute,
  adminAuditRoute,
  adminSettingsRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
