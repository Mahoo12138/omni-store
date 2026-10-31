import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

// 2.0 Phase 7 运维中心 E2E。
// 生产漂移场景（E2E 与服务同机，可直接操作测试环境磁盘）：
// 盘外修改文件 → 台账校准收敛；未知临时文件保留、已撤销任务载荷清理；完整性检查通过。

const baseURL = process.env.OMNISTORE_E2E_BASE_URL ?? 'http://127.0.0.1:18080'

let adminCookies: string | null = null
let adminCSRF = ''

async function adminLogin(page: import('@playwright/test').Page): Promise<{ cookie: string; csrf: string }> {
  if (adminCookies) return { cookie: adminCookies, csrf: adminCSRF }
  const response = await page.request.post(`${baseURL}/api/v1/auth/login`, {
    data: { username: 'admin', password: 'OmniStore-Test-Admin!' },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  const setCookie = response.headersArray().find((header) => header.name.toLowerCase() === 'set-cookie')!
  adminCookies = setCookie.value.split(';')[0]
  adminCSRF = body.data.csrf_token
  return { cookie: adminCookies, csrf: adminCSRF }
}

async function adminAPI(
  page: import('@playwright/test').Page,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<{ status: number; body: any }> {
  const { cookie, csrf } = await adminLogin(page)
  const response = await page.request.fetch(`${baseURL}${path}`, {
    method,
    headers: { cookie, 'X-CSRF-Token': csrf },
    data,
  })
  let body: any = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return { status: response.status(), body }
}

async function teamSourceDir(page: import('@playwright/test').Page): Promise<{ key: string; dir: string }> {
  const { body } = await adminAPI(page, 'GET', '/api/v1/admin/sources')
  const team = body.data.items.find((item: { name: string }) => item.name === '团队文件')
  expect(team).toBeTruthy()
  return { key: team.key, dir: team.root_path }
}

test('operations status, integrity check and cleanup converge real disk drift', async ({ page }) => {
  await adminLogin(page)
  const team = await teamSourceDir(page)

  // 1. 生产漂移：普通文件在盘外被外部程序修改（台账记录的是旧大小/时间）。
  const driftPath = join(team.dir, 'projects', 'roadmap.md')
  const original = readFileSync(driftPath, 'utf-8')
  writeFileSync(driftPath, `${original}\n<!-- out-of-band edit ${Date.now()} -->`, 'utf-8')

  // 2. 状态聚合：源健康显示物理用量 > 台账用量（漂移未校准前）。
  const statusBefore = await adminAPI(page, 'GET', '/api/v1/admin/operations/status')
  expect(statusBefore.status).toBe(200)
  const teamHealth = statusBefore.body.data.sources.find((item: { key: string }) => item.key === team.key)
  expect(teamHealth.root_accessible).toBe(true)
  expect(teamHealth.usage_bytes).toBeGreaterThan(teamHealth.ledger_bytes)
  expect(teamHealth.active_transfers).toBeUndefined()
  expect(statusBefore.body.data.transfers).toBeUndefined()
  const capabilities = statusBefore.body.data.capabilities.map((item: { capability: string }) => item.capability)
  expect(capabilities).toEqual(expect.arrayContaining(['public_drive', 'image_bed']))
  expect(capabilities).not.toContain('transfer_center')

  // 3. 原运维入口转到仪表盘；完整性检查与健康信息只出现一次。
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.goto('/app/admin?section=operations')
  await expect(page).toHaveURL(/section=stats$/)
  await expect(page.getByRole('heading', { name: '系统状态', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '设置分组' }).getByRole('button', { name: '运维中心', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '存储源健康', exact: true })).toHaveCount(1)
  await expect(page.getByRole('heading', { name: '存储源概览', exact: true })).toHaveCount(0)
  await expect(page.getByText('quick_check')).toBeVisible()
  await expect(page.getByText('ok', { exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /团队文件/ })).toContainText('可访问')
  await page.getByRole('button', { name: '完整性检查' }).click()
  const integrityReport = page.getByRole('dialog', { name: '完整性检查通过' })
  await expect(integrityReport).toBeVisible({ timeout: 10_000 })
  await expect(integrityReport.getByRole('term').filter({ hasText: 'integrity_check' })).toBeVisible()
  await expect(integrityReport.getByRole('definition').filter({ hasText: 'ok' })).toBeVisible()
  await integrityReport.getByRole('button', { name: '关闭', exact: true }).click()
  // 退场动画期间弹窗内容必须保持冻结。
  const titlesDuringExit = await page.evaluate(async () => {
    const seen: string[] = []
    for (let i = 0; i < 14; i++) {
      document.querySelectorAll('[role="dialog"] h2').forEach((h) => seen.push(h.textContent ?? ''))
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    return seen
  })
  expect([...new Set(titlesDuringExit)]).toEqual(['完整性检查通过'])
  await expect(integrityReport).toHaveCount(0)

  // 4. 从统一源表校准台账，校准报告和刷新后的健康数据保持一致。
  const reconcileResponse = page.waitForResponse((response) => response.url().endsWith(`/sources/${team.key}/reconcile`))
  const refreshedOverview = page.waitForResponse((response) => response.url().endsWith('/admin/overview'))
  await page.getByRole('row', { name: /团队文件/ }).getByRole('button', { name: '校准台账', exact: true }).click()
  const reconcile = await (await reconcileResponse).json()
  expect(reconcile.data.updated + reconcile.data.added).toBeGreaterThanOrEqual(1)
  const refreshed = (await (await refreshedOverview).json()).data.operations.sources.find((item: { key: string }) => item.key === team.key)
  expect(refreshed.ledger_bytes).toBeGreaterThan(teamHealth.ledger_bytes)
  await expect(page.getByRole('status').filter({ hasText: '团队文件 台账已校准' })).toBeVisible()

  // 5. 运行清理后报告可见，且只包含存储与协议维护项。
  const cleanupResponse = page.waitForResponse((response) => response.url().endsWith('/operations/cleanup'))
  const afterCleanup = page.waitForResponse((response) => response.url().endsWith('/admin/overview'))
  await page.getByRole('button', { name: '运行清理', exact: true }).click()
  const cleanup = await (await cleanupResponse).json()
  expect(cleanup.data.transfer_gc).toBeUndefined()
  await afterCleanup
  const cleanupReport = page.getByRole('dialog', { name: '清理完成' })
  await expect(cleanupReport.getByText('存储与协议')).toBeVisible()
  await expect(cleanupReport.getByText('流转中心')).toHaveCount(0)
  await expect(cleanupReport.getByRole('term').filter({ hasText: 'Multipart 上传' })).toBeVisible()
  await cleanupReport.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(cleanupReport).toHaveCount(0)
})

async function openDashboard(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
  await page.goto('/app/admin?section=stats')
}

test('dashboard uses one snapshot and recovers from initial and refresh failures', async ({ page }) => {
  let requests = 0
  let legacyRequests = 0
  let fail = true
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/admin/operations/status') legacyRequests++
  })
  await page.route('**/api/v1/admin/overview', async (route) => {
    requests++
    if (fail) {
      await route.fulfill({ status: 503, json: { error: { code: 'INTERNAL_ERROR', message: '测试：状态暂不可用' }, request_id: 'dashboard-test' } })
    } else {
      await route.continue()
    }
  })
  await openDashboard(page)
  await expect(page.getByRole('alert')).toContainText('仪表盘加载失败')
  await expect(page.getByRole('heading', { name: '数据库', exact: true })).toHaveCount(0)
  expect(requests).toBe(1)
  expect(legacyRequests).toBe(0)
  fail = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByText('quick_check', { exact: true })).toBeVisible()
  expect(requests).toBe(2)
  const teamRow = page.getByRole('row', { name: /团队文件/ })
  await expect(teamRow).toBeVisible()
  fail = true
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('当前显示上次成功获取的数据')
  await expect(teamRow).toBeVisible()
  expect(requests).toBe(3)
  fail = false
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(requests).toBe(4)
  expect(legacyRequests).toBe(0)
})

test('dashboard handles empty health data and failed maintenance without false success', async ({ page }) => {
  let partiallyCleaned = false
  await page.route('**/api/v1/admin/overview', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.data.operations.storage.thumbnail_cache_bytes = partiallyCleaned ? 128 : 4096
    body.data.operations.sources = []
    body.data.operations.recent_failed_audits = []
    body.data.operations.capabilities[0].source_key = ''
    body.data.operations.capabilities[0].enabled = true
    await route.fulfill({ response, json: body })
  })
  await page.route('**/api/v1/admin/operations/cleanup', (route) => {
    partiallyCleaned = true
    return route.fulfill({
      status: 500, json: { error: { code: 'INTERNAL_ERROR', message: '测试：清理未完成' }, request_id: 'cleanup-test' },
    })
  })
  await openDashboard(page)
  await expect(page.getByRole('cell', { name: /还没有存储源/ })).toBeVisible()
  await expect(page.getByText('近期没有失败记录。', { exact: true })).toBeVisible()
  await expect(page.getByText('未绑定', { exact: true })).toBeVisible()
  await expect(page.getByText('4.0 KB', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '运行清理', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('测试：清理未完成')
  // 失败只报错误，不弹结果窗（没有报告可展示）。
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '运行清理', exact: true })).toBeEnabled()
  await expect(page.getByText('128 B', { exact: true })).toBeVisible()
  await expect(page.getByText('4.0 KB', { exact: true })).toHaveCount(0)
})

test('merged dashboard stays usable across desktop and narrow screens', async ({ page }) => {
  await openDashboard(page)
  await expect(page.getByRole('row', { name: /团队文件/ })).toBeVisible()
  for (const width of [1455, 916, 375, 320]) {
    await page.setViewportSize({ width, height: 887 })
    await page.getByRole('heading', { name: '系统状态', exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: '完整性检查', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '运行清理', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    const region = page.getByRole('region', { name: '存储源健康', exact: true })
    await expect(region).toHaveCSS('overflow-x', 'auto')
    if (width <= 916) {
      await region.scrollIntoViewIfNeeded()
      expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
      await region.evaluate((element) => { element.scrollLeft = element.scrollWidth })
      await expect(region.getByRole('button', { name: '校准台账', exact: true }).first()).toBeInViewport()
    }
    if (width === 1455 || width === 375) {
      await page.screenshot({ path: `/tmp/omni-dashboard-${width}.png`, fullPage: true })
    }
  }
})


test('dashboard renders all sources and separates disabled, unavailable and protocol states', async ({ page }) => {
  await page.route('**/api/v1/admin/overview', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    const source = body.data.operations.sources[0]
    body.data.operations.recent_failed_audits = [{
      id: 987654, action: 'extension_operation_with_an_unknown_long_name',
      error_code: '测试：第三方操作失败', created_at: new Date().toISOString(),
    }]
    body.data.operations.sources = Array.from({ length: 6 }, (_, i) => ({
      ...source, key: `dashboard-source-${i}`, name: `健康测试源 ${i + 1}`,
      root_path: `/very/long/storage/path/${'nested-directory/'.repeat(12)}source-${i}`,
      disabled: i === 4, root_accessible: i !== 5,
      root_issue: i === 5 ? '根目录已移走，请恢复目录后刷新。' : '',
      webdav_enabled: true, s3_enabled: true, static_enabled: i === 0,
    }))
    await route.fulfill({ response, json: body })
  })
  await openDashboard(page)
  const region = page.getByRole('region', { name: '存储源健康', exact: true })
  await expect(region.getByRole('row')).toHaveCount(7)
  await expect(region.getByRole('row', { name: /健康测试源 1/ })).toContainText('静态 HTTP')
  const disabled = region.getByRole('row', { name: /健康测试源 5/ })
  await expect(disabled).toContainText('已禁用')
  await expect(disabled).toContainText('可访问')
  await expect(disabled.getByRole('button', { name: '校准台账', exact: true })).toBeEnabled()
  const unavailable = region.getByRole('row', { name: /健康测试源 6/ })
  await expect(unavailable).toContainText('不可访问')
  await expect(unavailable).toContainText('根目录已移走')
  await expect(unavailable).toContainText('— / —')
  await expect(unavailable.getByRole('button', { name: '校准台账', exact: true })).toBeDisabled()
  await expect(page.getByText('extension_operation_with_an_unknown_long_name', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 375, height: 887 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
