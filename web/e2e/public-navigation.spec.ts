import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'

type ServiceName = '公开网盘' | '匿名图床' | '文件中转'
type AccountName = '管理登录' | '进入工作台'
interface Share { key: string }
interface Transfer { id: number; public_key: string }
interface PublicRoute { path: string; current?: ServiceName; heading?: string; tone?: 'light' }
interface ButtonAppearance {
  name: string
  current: boolean
  className: string
  width: number
  height: number
  structure: Record<string, string>
  decoration: Record<string, string>
}

const serviceNames: ServiceName[] = ['公开网盘', '匿名图床', '文件中转']
const widths = [1440, 320, 375]
const screenshotNames: Record<string, string> = { '/': 'home', '/upload': 'upload', '/transfer?view=send': 'transfer', '/about': 'about' }
let ownerContext: BrowserContext | undefined
let owner: Page
let ownerCSRF = ''
let share: Share | undefined
let send: Transfer | undefined
let collection: Transfer | undefined
let sendTitle = ''
let collectionTitle = ''

// Uses cmd/testenv's isolated seed, including its credentials and README fixture.
// OMNISTORE_E2E_BASE_URL can point this suite at a separate test server.
async function login(page: Page, username: 'admin' | 'demo') {
  const response = await page.request.post('/api/v1/auth/login', {
    data: { username, password: username === 'admin' ? 'OmniStore-Test-Admin!' : 'OmniStore-Test-Demo!' },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).data.csrf_token as string
}

async function mutate<T>(path: string, method: string, data?: unknown): Promise<T> {
  const response = await owner.request.fetch(path, { method, data, headers: { 'X-CSRF-Token': ownerCSRF } })
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(200)
  return (await response.json()).data as T
}

function publicRoutes(): PublicRoute[] {
  return [
    { path: '/', current: '公开网盘', heading: '公开网盘' },
    { path: '/upload', current: '匿名图床', heading: '匿名图床' },
    { path: '/transfer?view=send', current: '文件中转', heading: '文件中转' },
    { path: '/transfer?view=collect', current: '文件中转', heading: '文件中转' },
    { path: '/transfer?view=history', current: '文件中转', heading: '文件中转' },
    { path: '/about', tone: 'light' },
    { path: '/public/', current: '公开网盘', heading: '公开网盘' },
    { path: `/s/${share!.key}`, heading: 'README.txt', tone: 'light' },
    { path: `/pickup/${send!.public_key}`, current: '文件中转', heading: sendTitle },
    { path: `/collect/${collection!.public_key}`, current: '文件中转', heading: collectionTitle },
  ]
}

function navigation(page: Page) {
  return page.getByRole('navigation', { name: '主导航', exact: true })
}

async function expectNavigation(page: Page, account: AccountName, current?: ServiceName) {
  const nav = navigation(page)
  await expect(nav).toHaveCount(1)
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link')).toHaveText([...serviceNames, account])
  await expect(nav.getByRole('link', { name: '收发记录', exact: true })).toHaveCount(0)
  for (const name of [...serviceNames, account]) {
    const link = nav.getByRole('link', { name, exact: true })
    await expect(link).toBeVisible()
    await expect(link).toBeInViewport()
    if (name === current) await expect(link).toHaveAttribute('aria-current', 'page')
    else await expect(link).not.toHaveAttribute('aria-current', 'page')
  }
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(current ? 1 : 0)
  const destinations = [
    { name: '公开网盘', path: '/' },
    { name: '匿名图床', path: '/upload' },
    { name: '文件中转', path: '/transfer', view: 'send' },
    { name: account, path: account === '管理登录' ? '/login' : '/app' },
  ]
  for (const destination of destinations) {
    const href = await nav.getByRole('link', { name: destination.name, exact: true }).getAttribute('href')
    expect(href).toBeTruthy()
    const url = new URL(href!, page.url())
    expect(url.origin).toBe(new URL(page.url()).origin)
    expect(url.pathname).toBe(destination.path)
    if (destination.view) expect(url.searchParams.get('view')).toBe(destination.view)
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  return nav
}

async function appearance(nav: Locator): Promise<ButtonAppearance[]> {
  return nav.getByRole('link').evaluateAll((links) => links.map((element) => {
    const link = element as HTMLElement
    const style = getComputedStyle(link)
    const rect = link.getBoundingClientRect()
    const properties = (names: string[]) => Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]))
    return {
      name: link.textContent!.trim(), current: link.getAttribute('aria-current') === 'page',
      className: [...link.classList].filter((name) => name !== 'active').sort().join(' '),
      width: rect.width, height: rect.height,
      structure: properties(['display', 'align-items', 'justify-content', 'gap', 'font-family', 'font-size', 'font-weight', 'line-height', 'padding', 'border-width', 'border-style', 'border-radius', 'white-space']),
      decoration: properties(['color', 'background-color', 'border-color', 'box-shadow']),
    }
  }))
}

async function expectUnclippedButtons(nav: Locator) {
  const problems = await nav.getByRole('link').evaluateAll((links) => {
    const result: string[] = []
    const rects = links.map((link) => link.getBoundingClientRect())
    links.forEach((element, index) => {
      const link = element as HTMLElement
      const rect = rects[index]
      const name = link.textContent!.trim()
      const icon = link.querySelector('svg')?.getBoundingClientRect()
      if (!icon || Math.abs(icon.width - 14) > 0.1 || Math.abs(icon.height - 14) > 0.1) result.push(`${name}: incorrect compact icon size`)
      if (rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.bottom > innerHeight + 1) result.push(`${name}: outside viewport`)
      if (link.scrollWidth > link.clientWidth + 1 || link.scrollHeight > link.clientHeight + 1) result.push(`${name}: clipped content`)
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      if (!hit || !link.contains(hit)) result.push(`${name}: blocked click target`)
      rects.slice(index + 1).forEach((other, offset) => {
        if (Math.min(rect.right, other.right) - Math.max(rect.left, other.left) > 1 && Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top) > 1) {
          result.push(`${name}: overlaps ${links[index + offset + 1].textContent!.trim()}`)
        }
      })
    })
    return result
  })
  expect(problems).toEqual([])
  expect(await nav.page().evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
}

async function checkRouteMatrix(page: Page, account: AccountName) {
  const dimensions = new Map<string, ButtonAppearance>()
  const appearances = new Map<string, ButtonAppearance>()
  let sharedClassName: string | undefined
  for (const route of publicRoutes()) {
    await test.step(`${account}: ${route.path}`, async () => {
      await page.goto(route.path)
      if (route.heading) await expect(page.getByRole('heading', { name: route.heading, exact: true, level: 1 })).toBeVisible()
      if (route.path === '/public/') await expect(page.getByRole('link', { name: 'README.txt', exact: true })).toBeVisible()
      const nav = await expectNavigation(page, account, route.current)
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      await expectUnclippedButtons(nav)
      for (const button of await appearance(nav)) {
        sharedClassName ??= button.className
        expect(button.className, `${route.path}: shared navigation button class`).toBe(sharedClassName)
        expect(button.height, `${route.path}: compact navigation button height`).toBeCloseTo(32, 1)
        expect(button.structure.padding).toBe('0px 10px')
        expect(button.structure.gap).toBe('6px')
        expect(button.structure['border-radius']).toBe('2px')
        const baseline = dimensions.get(button.name)
        if (baseline) {
          expect(button.width, `${route.path}: ${button.name} width`).toBeCloseTo(baseline.width, 1)
          expect(button.height, `${route.path}: ${button.name} height`).toBeCloseTo(baseline.height, 1)
          expect(button.structure, `${route.path}: ${button.name} structure`).toEqual(baseline.structure)
        } else dimensions.set(button.name, button)
        // The ordinary shell uses a light tone; selection and dark/light colors
        // vary intentionally while geometry and common button classes stay fixed.
        const stateKey = `${button.name}:${button.current}:${route.tone ?? 'dark'}`
        const sameState = appearances.get(stateKey)
        if (sameState) {
          expect(button.className, `${route.path}: ${button.name} classes`).toBe(sameState.className)
          expect(button.decoration, `${route.path}: ${button.name} decoration`).toEqual(sameState.decoration)
        } else appearances.set(stateKey, button)
      }
      const width = page.viewportSize()!.width
      const screenshotName = screenshotNames[route.path]
      if (account === '管理登录' && [1440, 320].includes(width) && screenshotName) {
        await page.screenshot({ path: `/private/tmp/omni-public-nav-${width}-${screenshotName}.png`, fullPage: true })
      }
    })
  }
}

async function clickService(page: Page, name: ServiceName, path: string, view?: string) {
  await navigation(page).getByRole('link', { name, exact: true }).click()
  await expect.poll(() => new URL(page.url()).pathname).toBe(path)
  if (view) await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe(view)
  await expectNavigation(page, '管理登录', name)
  await expectUnclippedButtons(navigation(page))
}

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(60_000)
  expect(baseURL).toBeTruthy()
  ownerContext = await browser.newContext({ baseURL })
  owner = await ownerContext.newPage()
  ownerCSRF = await login(owner, 'admin')
  const response = await owner.request.get('/api/v1/admin/sources')
  expect(response.status()).toBe(200)
  const sources = (await response.json()).data.items as { key: string; name: string; is_disabled: boolean }[]
  const source = sources.find((item) => item.name === '公开演示资料')
  expect(source, 'cmd/testenv public fixture source').toBeDefined()
  expect(source!.is_disabled).toBe(false)
  share = await mutate<Share>('/api/v1/shares', 'POST', { source_key: source!.key, path: '/README.txt', max_downloads: 0 })
  const suffix = Date.now()
  sendTitle = `导航回归取件 ${suffix}`
  collectionTitle = `导航回归收集 ${suffix}`
  send = (await mutate<{ send: Transfer }>('/api/v1/transfers', 'POST', { title: sendTitle, require_code: false, expires_in_hours: 24 })).send
  const upload = await owner.request.post(`/api/v1/transfers/${send.id}/files/upload`, {
    headers: { 'X-CSRF-Token': ownerCSRF },
    multipart: { relative_path: 'navigation.txt', file: { name: 'navigation.txt', mimeType: 'text/plain', buffer: Buffer.from('PUBLIC-NAVIGATION-FIXTURE') } },
  })
  expect(upload.status()).toBe(200)
  await mutate(`/api/v1/transfers/${send.id}/finalize`, 'POST')
  collection = (await mutate<{ collection: Transfer }>('/api/v1/transfer-collections', 'POST', {
    title: collectionTitle, require_code: false, require_name: false, require_note: false, expires_in_hours: 24,
  })).collection
})

test.afterAll(async () => {
  if (!ownerContext) return
  try {
    if (collection) await mutate(`/api/v1/transfer-collections/${collection.id}/close`, 'POST')
    if (send) await mutate(`/api/v1/transfers/${send.id}`, 'DELETE')
    if (share) await mutate(`/api/v1/shares/${share.key}`, 'DELETE')
  } finally {
    await ownerContext.close()
  }
})

for (const width of widths) {
  test(`anonymous public navigation is consistent and routes correctly at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await checkRouteMatrix(page, '管理登录')
    await page.goto('/about')
    await expectNavigation(page, '管理登录')
    await clickService(page, '匿名图床', '/upload')
    await clickService(page, '文件中转', '/transfer', 'send')
    const historyTab = page.getByRole('tab', { name: '收发记录', exact: true })
    await historyTab.click()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/transfer')
    await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('history')
    await expect(historyTab).toHaveAttribute('aria-selected', 'true')
    await expectNavigation(page, '管理登录', '文件中转')
    await expectUnclippedButtons(navigation(page))
    await clickService(page, '公开网盘', '/')
    await navigation(page).getByRole('link', { name: '管理登录', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel('用户名', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })

  test(`signed-in public navigation exposes the workbench at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 1000 })
    await login(page, 'demo')
    await checkRouteMatrix(page, '进入工作台')
    await navigation(page).getByRole('link', { name: '进入工作台', exact: true }).click()
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByRole('button', { name: '账号菜单：演示用户', exact: true })).toBeVisible()
  })
}
