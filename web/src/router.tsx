import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
} from '@tanstack/react-router'

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
  path: '/p/$',
  component: lazyRouteComponent(() => import('./pages/PublicBrowse'), 'PublicBrowsePage'),
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

interface GlobalSearchParams {
  q: string
  source: string
  page: number
}

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/search',
  component: lazyRouteComponent(() => import('./pages/Search'), 'SearchPage'),
  validateSearch: (search: Record<string, unknown>): GlobalSearchParams => ({
    q: typeof search.q === 'string' ? search.q : '',
    source: typeof search.source === 'string' ? search.source : '',
    page: Number(search.page) >= 1 ? Number(search.page) : 1,
  }),
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

const sharesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/shares',
  component: lazyRouteComponent(() => import('./pages/Shares'), 'SharesPage'),
})

// 管理员侧（README §24.3）
// 系统设置页（多 section 布局）：侧边栏"系统设置"入口，左侧分组导航 + 右侧内容。
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/admin',
  component: lazyRouteComponent(() => import('./pages/admin/AdminOverview'), 'AdminOverviewPage'),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  publicBrowseRoute,
  anonymousUploadRoute,
  publicShareRoute,
  aboutRoute,
  loginRoute,
  setupRoute,
  appRoute,
  searchRoute,
  fileManagerRoute,
  trashRoute,
  imageBedRoute,
  sharesRoute,
  adminRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
