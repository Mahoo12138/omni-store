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
import { AboutPage } from './pages/About'
import { AdminOverviewPage } from './pages/admin/AdminOverview'

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

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: AboutPage,
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

// 管理员侧（README §24.3）
// 系统设置页（多 section 布局）：侧边栏"系统设置"入口，左侧分组导航 + 右侧内容。
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/admin',
  component: AdminOverviewPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  publicBrowseRoute,
  anonymousUploadRoute,
  aboutRoute,
  loginRoute,
  setupRoute,
  appRoute,
  fileManagerRoute,
  imageBedRoute,
  adminRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
