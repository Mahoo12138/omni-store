import { expect, test, type Download, type Page } from '@playwright/test'

interface Binding { capability: string; enabled: boolean; source_key?: string; revision: number }
interface Source { key: string; name: string; is_disabled: boolean }
interface Send { id: number; public_key: string }
interface Collection { id: number; public_key: string }
interface Flag { enabled: boolean; status: string; hint: string }

async function read<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(path)
  expect(response.status(), `GET ${path}`).toBe(200)
  return (await response.json()).data as T
}

async function login(page: Page, username = 'admin') {
  const response = await page.request.post('/api/v1/auth/login', {
    data: { username, password: username === 'admin' ? 'OmniStore-Test-Admin!' : 'OmniStore-Test-Demo!' },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).data.csrf_token as string
}

async function mutate<T>(page: Page, csrf: string, path: string, method: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(path, { method, data, headers: { 'X-CSRF-Token': csrf } })
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(200)
  return (await response.json()).data as T
}

async function transferBinding(page: Page) {
  const binding = (await read<{ items: Binding[] }>(page, '/api/v1/admin/capabilities')).items.find((item) => item.capability === 'transfer_center')
  expect(binding).toBeDefined()
  return binding!
}

async function expectSelectedNav(page: Page) {
  await expect(page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('link', { name: '文件中转', exact: true })).toHaveAttribute('aria-current', 'page')
}

async function bytes(download: Download) {
  const stream = await download.createReadStream()
  expect(stream).not.toBeNull()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const clipped = await page.locator('main').evaluate((main) => [...main.querySelectorAll<HTMLElement>('*')].filter((element) => {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    let ancestor: HTMLElement | null = element.parentElement
    while (ancestor && ancestor !== main) {
      const overflow = getComputedStyle(ancestor).overflowX
      if (overflow === 'auto' || overflow === 'scroll') return false
      ancestor = ancestor.parentElement
    }
    return rect.left < -1 || rect.right > window.innerWidth + 1
  }).map((element) => element.tagName + ':' + element.textContent?.trim().slice(0, 80)))
  expect(clipped).toEqual([])
}

test('public pickup and collection links open directly and disabling new tasks preserves existing pickup and records', async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000)
  expect(baseURL).toBeTruthy()
  const ownerContext = await browser.newContext({ baseURL })
  const owner = await ownerContext.newPage()
  const csrf = await login(owner)
  const original = await transferBinding(owner)
  const team = (await read<{ items: Source[] }>(owner, '/api/v1/admin/sources')).items.find((source) => source.name === '团队文件')
  expect(team).toBeDefined()
  expect(team!.is_disabled).toBe(false)
  let send: Send | undefined
  let collection: Collection | undefined
  try {
    await mutate(owner, csrf, '/api/v1/admin/capabilities/transfer_center', 'PUT', { enabled: true, storage_source_key: team!.key, expected_revision: original.revision })
    const created = await mutate<{ send: Send; pickup_code: string }>(owner, csrf, '/api/v1/transfers', 'POST', {
      title: '公开交付 · 服务关闭后仍可取件', description: '现有链接按原有效期提供访问。', require_code: false, expires_in_hours: 24,
    })
    send = created.send
    expect(created.pickup_code).toBe('')
    const payload = Buffer.from('PORTAL-PICKUP\n中文与空格路径')
    const relativePath = '交付/说明 空格.txt'
    const upload = await owner.request.post(`/api/v1/transfers/${send.id}/files/upload`, {
      headers: { 'X-CSRF-Token': csrf }, multipart: { relative_path: relativePath, file: { name: '说明 空格.txt', mimeType: 'text/plain', buffer: payload } },
    })
    expect(upload.status()).toBe(200)
    await mutate(owner, csrf, `/api/v1/transfers/${send.id}/finalize`, 'POST')
    collection = (await mutate<{ collection: Collection; code: string }>(owner, csrf, '/api/v1/transfer-collections', 'POST', {
      title: '公开资料收集', require_code: false, require_name: false, require_note: false, expires_in_hours: 24,
    })).collection
    expect(send.public_key).toMatch(/^tr-[0-9a-f]{24}$/)
    expect(collection.public_key).toMatch(/^tc-[0-9a-f]{24}$/)
    // Direct-link access still obtains a scoped bearer grant; an arbitrary API client has none.
    expect((await page.request.get(`/api/v1/public/transfers/${send.public_key}/files`)).status()).toBe(404)
    await page.goto(`/pickup/${send.public_key}`)
    await expectSelectedNav(page)
    await expect(page.getByRole('heading', { name: '公开交付 · 服务关闭后仍可取件', exact: true })).toBeVisible()
    await expect(page.getByLabel('取件码', { exact: true })).toHaveCount(0)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: `下载 ${relativePath}`, exact: true }).click()
    expect(await bytes(await download)).toEqual(payload)
    await page.goto(`/collect/${collection.public_key}`)
    await expectSelectedNav(page)
    await expect(page.getByRole('heading', { name: '公开资料收集', exact: true })).toBeVisible()
    await expect(page.getByLabel('收件码', { exact: true })).toHaveCount(0)
    await page.getByTestId('collect-upload-files').setInputFiles({ name: '补充说明.txt', mimeType: 'text/plain', buffer: Buffer.from('PUBLIC-COLLECT') })
    await page.getByRole('button', { name: '提交文件', exact: true }).click()
    await expect(page.getByRole('heading', { name: '提交成功', exact: true })).toBeVisible()
    await expectSelectedNav(page)
    expect((await page.request.get(`/api/v1/transfer-collections/${collection.id}/submissions`)).status()).toBe(401)

    const current = await transferBinding(owner)
    await mutate(owner, csrf, '/api/v1/admin/capabilities/transfer_center', 'PUT', { enabled: false, expected_revision: current.revision })
    const status = await read<{ transfer_center: Flag }>(page, '/api/v1/system/status')
    expect(status.transfer_center.enabled).toBe(false)
    expect(status.transfer_center.hint).not.toBe('')
    const blockedCreate = await owner.request.post('/api/v1/transfers', { headers: { 'X-CSRF-Token': csrf }, data: { title: '关闭服务后不应创建', require_code: false } })
    expect(blockedCreate.ok()).toBe(false)
    expect((await blockedCreate.json()).data).toBeUndefined()
    await owner.goto(`/transfer?view=history&record=send&id=${send.id}`)
    await expect(owner.getByRole('heading', { name: '公开交付 · 服务关闭后仍可取件', exact: true })).toBeVisible()
    await owner.reload()
    await expect(owner.getByRole('link', { name: '打开取件页面', exact: true })).toBeVisible()
    await page.goto(`/pickup/${send.public_key}`)
    await expect(page.getByRole('heading', { name: '公开交付 · 服务关闭后仍可取件', exact: true })).toBeVisible()
    const oldDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: `下载 ${relativePath}`, exact: true }).click()
    expect(await bytes(await oldDownload)).toEqual(payload)
  } finally {
    if (collection) await mutate(owner, csrf, `/api/v1/transfer-collections/${collection.id}/close`, 'POST')
    if (send) await mutate(owner, csrf, `/api/v1/transfers/${send.id}`, 'DELETE')
    const current = await transferBinding(owner)
    await mutate(owner, csrf, '/api/v1/admin/capabilities/transfer_center', 'PUT', {
      enabled: original.enabled, storage_source_key: original.source_key ?? '', expected_revision: current.revision,
    })
    await ownerContext.close()
  }
})

test('public navigation, three workspace tabs, long branding and status retry fit 320px and 375px', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const status = await read<Record<'public_drive' | 'image_bed' | 'transfer_center', Flag>>(page, '/api/v1/system/status')
  for (const capability of ['public_drive', 'image_bed', 'transfer_center'] as const) {
    expect(typeof status[capability].enabled).toBe('boolean')
    expect(typeof status[capability].status).toBe('string')
    expect(typeof status[capability].hint).toBe('string')
  }
  // Signed-in and visitor ownership have separate coverage below.
  await login(page, 'demo')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const publicNav = page.getByRole('navigation', { name: '主导航', exact: true })
  await expect(publicNav.getByRole('link', { name: '文件中转', exact: true })).toHaveAttribute('href', /^\/transfer(?:\?view=send)?$/)
  await publicNav.getByRole('link', { name: '文件中转', exact: true }).click()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/transfer')
  await expectSelectedNav(page)
  await expect(page.getByRole('tab', { name: '发送文件', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('发件包标题', { exact: true })).toBeVisible()
  await expect(page.getByLabel('取件链接', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('收集链接', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: '/tmp/omni-public-transfer-desktop.png', fullPage: true })

  const unavailableHint = 'E2E：文件中转载体暂不可用，请联系管理员。'
  const longBrand = '一个较长的自部署文件站点名称OmniStoreContinuousBrandName'
  let useLongBrand = false
  let statusUnavailable = false
  await page.route('**/api/v1/system/status', async (route) => {
    if (statusUnavailable) {
      await route.fulfill({ status: 503, json: { error: { code: 'INTERNAL_ERROR', message: 'E2E 状态查询暂不可用' } } })
      return
    }
    const response = await route.fetch()
    const body = await response.json()
    body.data.transfer_center = { enabled: false, status: '不可用', hint: unavailableHint }
    if (useLongBrand) body.data.instance_name = longBrand
    await route.fulfill({ response, json: body })
  })
  try {
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 })
      await page.goto('/')
      await expect(publicNav.getByRole('link', { name: '文件中转', exact: true })).toBeVisible()
      await expectNoOverflow(page)
      await publicNav.getByRole('link', { name: '文件中转', exact: true }).click()
      await page.reload()
      await expect(page.getByText(unavailableHint, { exact: true })).toBeVisible()
      await expectSelectedNav(page)
      for (const tabName of ['发送文件', '收集文件', '收发记录']) {
        const tab = page.getByRole('tab', { name: tabName, exact: true })
        await tab.scrollIntoViewIfNeeded()
        await expect(tab).toBeInViewport()
        await tab.click()
        await expect(tab).toHaveAttribute('aria-selected', 'true')
        if (tabName === '发送文件') {
          await expect(page.getByLabel('发件包标题', { exact: true })).toBeVisible()
          await page.getByRole('button', { name: '发送设置', exact: true }).click()
          await expect(page.getByLabel('访问密码', { exact: true })).toBeVisible()
        } else if (tabName === '收集文件') {
          await expect(page.getByLabel('收集任务标题', { exact: true })).toBeVisible()
          await page.getByRole('button', { name: '收集设置', exact: true }).click()
          await page.locator('details').getByRole('tab', { name: '文件', exact: true }).click()
          await expect(page.getByLabel('总量上限 MB', { exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: '生成收集链接', exact: true })).toBeDisabled()
        }
        await expectNoOverflow(page)
      }
      await page.getByRole('tab', { name: '发送文件', exact: true }).click()
      await page.screenshot({ path: `/tmp/omni-public-transfer-${width}.png`, fullPage: true })
    }
    useLongBrand = true
    await page.setViewportSize({ width: 320, height: 812 })
    await page.goto('/transfer')
    const brand = page.getByRole('link', { name: `返回 ${longBrand} 公开网盘`, exact: true })
    await expect(brand).toBeVisible()
    await expectNoOverflow(page)
    expect(await brand.locator('svg').evaluate((logo) => logo.getBoundingClientRect().width)).toBeCloseTo(32, 1)
    await page.screenshot({ path: '/tmp/omni-public-transfer-long-brand.png', fullPage: true })
    useLongBrand = false
    statusUnavailable = true
    await page.reload()
    await expect(page.getByText('状态未知', { exact: true })).toBeVisible()
    await expect(page.getByText(unavailableHint, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: '收发记录', exact: true })).toBeEnabled()
    await expectNoOverflow(page)
    statusUnavailable = false
    await page.getByRole('button', { name: '重新检查', exact: true }).click()
    await expect(page.getByText(unavailableHint, { exact: true })).toBeVisible()
    await expect(page.getByText('状态未知', { exact: true })).toHaveCount(0)
    await page.goto('/app/transfer')
    // 登录侧的流转已并入公开页：旧地址重定向到 /transfer。
    await expect(page).toHaveURL(/\/transfer(\?|$)/)
    await expect(page.getByRole('heading', { name: '文件中转', exact: true })).toBeVisible()
    for (const name of ['发送文件', '收集文件', '收发记录']) await expect(page.getByRole('tab', { name, exact: true })).toBeVisible()
    await expectNoOverflow(page)
    expect(errors).toEqual([])
  } finally {
    await page.unroute('**/api/v1/system/status')
  }
})

test('visitor identity persists send and collection records without granting app access or sharing ownership', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000)
  expect(baseURL).toBeTruthy()
  const otherVisitor = await browser.newContext({ baseURL })
  const normalUser = await browser.newContext({ baseURL })
  const recipient = await browser.newContext({ baseURL })
  let csrf = ''
  let send: Send | undefined
  let collection: Collection | undefined
  try {
    expect((await page.request.get('/api/v1/transfer-identity')).status()).toBe(401)
    const bootstrap = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/transfer-identity' && response.request().method() === 'POST')
    await page.goto('/transfer')
    const identityResponse = await bootstrap
    expect(identityResponse.status()).toBe(200)
    const identity = (await identityResponse.json()).data as { kind: string; owner_key: string; csrf_token: string; expires_at: string }
    expect(identity.kind).toBe('guest')
    expect(identity.owner_key).toBeTruthy()
    expect(identity.csrf_token).toBeTruthy()
    csrf = identity.csrf_token
    const restored = await page.request.post('/api/v1/transfer-identity', { data: {} })
    expect(restored.status()).toBe(200)
    expect((await restored.json()).data.owner_key).toBe(identity.owner_key)
    for (const path of ['/api/v1/auth/me', '/api/v1/sources', '/api/v1/admin/sources']) expect((await page.request.get(path)).status(), path).toBe(401)

    await page.getByRole('tab', { name: '收集文件', exact: true }).click()
    await page.getByLabel('收集任务标题', { exact: true }).fill('E2E 访客收集 · 刷新持久')
    await page.screenshot({ path: '/private/tmp/omni-transfer-create-collect-desktop.png', fullPage: true })
    const createCollection = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/transfer-collections' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '生成收集链接', exact: true }).click()
    const collectionResponse = await createCollection
    expect(collectionResponse.status()).toBe(200)
    const createdCollection = (await collectionResponse.json()).data
    collection = createdCollection.collection
    expect(createdCollection.code).toBe('')
    const expiresAt = Date.parse(createdCollection.collection.expires_at)
    expect(expiresAt).toBeGreaterThan(Date.now())
    expect(expiresAt).toBeLessThanOrEqual(Date.parse(identity.expires_at) + 1000)
    await expect(page.getByRole('heading', { name: '收集链接已生成', exact: true })).toBeVisible()
    const collectionHref = await page.getByRole('link', { name: '打开收集页面', exact: true }).getAttribute('href')
    await page.getByRole('button', { name: '查看收发记录', exact: true }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('id')).toBe(String(collection!.id))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'E2E 访客收集 · 刷新持久', exact: true })).toBeVisible()
    expect((await read<{ owner_key: string; kind: string }>(page, '/api/v1/transfer-identity')).owner_key).toBe(identity.owner_key)
    expect((await page.request.get(`/api/v1/transfer-collections/${collection!.id}/submissions`)).status()).toBe(200)

    await page.getByRole('tab', { name: '发送文件', exact: true }).click()
    await page.getByLabel('发件包标题', { exact: true }).fill('E2E 访客交付 · 刷新持久')
    await page.getByTestId('transfer-upload-files').setInputFiles({ name: 'visitor.txt', mimeType: 'text/plain', buffer: Buffer.from('VISITOR-SEND-BYTES') })
    const createSend = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/transfers' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '发送文件', exact: true }).click()
    const sendResponse = await createSend
    expect(sendResponse.status()).toBe(200)
    const createdSend = (await sendResponse.json()).data
    send = createdSend.send
    expect(createdSend.pickup_code).toBe('')
    await expect(page.getByRole('heading', { name: '文件已发送', exact: true })).toBeVisible()
    const sendHref = await page.getByRole('link', { name: '打开取件页面', exact: true }).getAttribute('href')
    await page.getByRole('button', { name: '查看收发记录', exact: true }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('record')).toBe('send')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'E2E 访客交付 · 刷新持久', exact: true })).toBeVisible()
    expect((await read<{ owner_key: string }>(page, '/api/v1/transfer-identity')).owner_key).toBe(identity.owner_key)
    csrf = (await read<{ csrf_token: string }>(page, '/api/v1/transfer-identity')).csrf_token
    const missingCSRF = await page.request.delete(`/api/v1/transfers/${send!.id}`)
    expect(missingCSRF.status()).toBe(403)
    expect((await page.request.get(`/api/v1/transfers/${send!.id}`)).status()).toBe(200)

    const another = await otherVisitor.newPage()
    await another.goto('/transfer')
    await expect(another.getByLabel('发件包标题', { exact: true })).toBeVisible()
    await expect.poll(async () => {
      const response = await another.request.get('/api/v1/transfer-identity')
      return response.status() === 200 ? (await response.json()).data.kind : ''
    }).toBe('guest')
    const secondIdentity = await read<{ owner_key: string; csrf_token: string }>(another, '/api/v1/transfer-identity')
    expect(secondIdentity.owner_key).not.toBe(identity.owner_key)
    const user = await normalUser.newPage()
    await login(user, 'demo')
    const sources = await read<{ items: Source[] }>(user, '/api/v1/sources')
    const team = sources.items.find((source) => source.name === '团队文件')!
    expect(team).toBeDefined()
    for (const outsider of [another, user]) {
      for (const path of [`/api/v1/transfers/${send!.id}`, `/api/v1/transfers/${send!.id}/files`, `/api/v1/transfer-collections/${collection!.id}`, `/api/v1/transfer-collections/${collection!.id}/submissions`]) {
        expect((await outsider.request.get(path)).status(), path).toBe(404)
      }
      expect(await (await outsider.request.get('/api/v1/transfers')).text()).not.toContain('E2E 访客交付 · 刷新持久')
      expect(await (await outsider.request.get('/api/v1/transfer-collections')).text()).not.toContain('E2E 访客收集 · 刷新持久')
    }
    expect((await another.request.delete(`/api/v1/transfers/${send!.id}`, { headers: { 'X-CSRF-Token': secondIdentity.csrf_token } })).status()).toBe(404)
    const sourceCopy = await page.request.post(`/api/v1/transfers/${send!.id}/files/from-store`, {
      headers: { 'X-CSRF-Token': csrf }, data: { source_key: team.key, paths: ['projects/roadmap.md'] },
    })
    expect([401, 403]).toContain(sourceCopy.status())

    const publicPage = await recipient.newPage()
    await publicPage.goto(sendHref!)
    const download = publicPage.waitForEvent('download')
    await publicPage.getByRole('button', { name: '下载 visitor.txt', exact: true }).click()
    expect(await bytes(await download)).toEqual(Buffer.from('VISITOR-SEND-BYTES'))
    await publicPage.goto(collectionHref!)
    await publicPage.getByLabel('提交者姓名', { exact: true }).fill('访客接收者')
    await publicPage.getByTestId('collect-upload-files').setInputFiles({ name: 'visitor-answer.txt', mimeType: 'text/plain', buffer: Buffer.from('VISITOR-COLLECT-BYTES') })
    const submit = publicPage.waitForResponse((response) => new URL(response.url()).pathname.endsWith(`/transfer-collections/${collection!.public_key}/submit`) && response.request().method() === 'POST')
    await publicPage.getByRole('button', { name: '提交文件', exact: true }).click()
    const submission = (await (await submit).json()).data
    await expect(publicPage.getByRole('heading', { name: '提交成功', exact: true })).toBeVisible()
    const inbox = await read<{ items: Array<{ id: number; files: Array<{ id: number }> }> }>(page, `/api/v1/transfer-collections/${collection!.id}/submissions`)
    expect(inbox.items).toHaveLength(1)
    const downloadPath = `/api/v1/transfer-collections/${collection!.id}/submissions/${submission.id}/files/${inbox.items[0].files[0].id}/download`
    expect((await page.request.get(downloadPath)).status()).toBe(200)
    expect(await (await page.request.get(downloadPath)).body()).toEqual(Buffer.from('VISITOR-COLLECT-BYTES'))
    const sourceSave = await page.request.post(`/api/v1/transfer-collections/${collection!.id}/submissions/${submission.id}/save-to-files`, {
      headers: { 'X-CSRF-Token': csrf }, data: { source_key: team.key, path: `from-visitor-${collection!.id}` },
    })
    expect([401, 403]).toContain(sourceSave.status())
    for (const path of ['/api/v1/auth/me', '/api/v1/sources']) expect((await page.request.get(path)).status(), path).toBe(401)
    await page.goto(`/transfer?view=history&record=collect&id=${collection!.id}`)
    await page.getByRole('button', { name: '下载 visitor-answer.txt', exact: true }).waitFor({ state: 'visible' })
    await page.reload()
    await page.getByRole('button', { name: '下载 visitor-answer.txt', exact: true }).waitFor({ state: 'visible' })
    await page.screenshot({ path: '/private/tmp/omni-transfer-history-desktop.png', fullPage: true })
  } finally {
    if (collection && csrf) await mutate(page, csrf, `/api/v1/transfer-collections/${collection.id}/close`, 'POST')
    if (send && csrf) await mutate(page, csrf, `/api/v1/transfers/${send.id}`, 'DELETE')
    await recipient.close()
    await normalUser.close()
    await otherVisitor.close()
  }
})

test('UI logout and a second login never show the previous owner cache when identity recovery fails', async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000)
  expect(baseURL).toBeTruthy()
  const cleanupContext = await browser.newContext({ baseURL })
  const cleanup = await cleanupContext.newPage()
  const title = 'E2E 账户 A 的私有记录 · 缓存隔离'
  let send: Send | undefined
  try {
    await page.goto('/login')
    await page.getByLabel('用户名', { exact: true }).fill('demo')
    await page.getByLabel('密码', { exact: true }).fill('OmniStore-Test-Demo!')
    const firstLogin = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/auth/login' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    const firstResponse = await firstLogin
    expect(firstResponse.status()).toBe(200)
    const csrf = (await firstResponse.json()).data.csrf_token as string
    send = (await mutate<{ send: Send }>(page, csrf, '/api/v1/transfers', 'POST', { title, require_code: false })).send
    await page.goto('/transfer')
    await page.getByRole('tab', { name: '收发记录', exact: true }).click()
    const record = page.getByRole('article', { name: `发件包 ${title}`, exact: true })
    await expect(record).toBeVisible()
    await record.getByRole('button', { name: '查看任务', exact: true }).click()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await page.getByRole('button', { name: '返回收发记录', exact: true }).click()
    await expect(record).toBeVisible()
    await page.getByRole('button', { name: /^账号菜单：/ }).click()
    await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/login')

    await page.route('**/api/v1/transfer-identity', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'E2E 第二个账户身份恢复失败' } } })
    })
    await page.getByLabel('用户名', { exact: true }).fill('admin')
    await page.getByLabel('密码', { exact: true }).fill('OmniStore-Test-Admin!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    // 侧栏入口已移除；登录身份在公开页同样生效，故直接走 /transfer。
    await page.goto('/transfer')
    await expect(page.getByRole('alert')).toContainText('收发身份暂时无法恢复')
    await page.getByRole('tab', { name: '收发记录', exact: true }).click()
    await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0)
    await expect(page.getByRole('article', { name: `发件包 ${title}`, exact: true })).toHaveCount(0)
    await expect(page.getByText(title, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toHaveCount(0)
    await page.unroute('**/api/v1/transfer-identity')
    await page.getByRole('button', { name: '重新检查收发身份', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '收发记录', exact: true })).toBeVisible()
    await expect(page.getByRole('article', { name: `发件包 ${title}`, exact: true })).toHaveCount(0)
    expect((await page.request.get(`/api/v1/transfers/${send.id}`)).status()).toBe(404)
  } finally {
    await page.unroute('**/api/v1/transfer-identity')
    if (send) {
      const csrf = await login(cleanup, 'demo')
      await mutate(cleanup, csrf, `/api/v1/transfers/${send.id}`, 'DELETE')
    }
    await cleanupContext.close()
  }
})
