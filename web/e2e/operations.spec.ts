import { mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

// 2.0 Phase 7 运维中心 E2E。
// 生产漂移场景（E2E 与服务同机，可直接操作测试环境磁盘）：
// 盘外修改文件 → 台账校准收敛；孤儿临时文件 → 清理编排删除；完整性检查通过。

const baseURL = 'http://127.0.0.1:18080'
const dataRoot = join(process.cwd(), '..', '.testdata')

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
  method: 'GET' | 'POST',
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
  const { cookie } = await adminLogin(page)
  const team = await teamSourceDir(page)

  // 1. 生产漂移 A：普通文件在盘外被外部程序修改（台账记录的是旧大小/时间）。
  const driftPath = join(team.dir, 'projects', 'roadmap.md')
  const original = readFileSync(driftPath, 'utf-8')
  writeFileSync(driftPath, `${original}\n<!-- out-of-band edit ${Date.now()} -->`, 'utf-8')

  // 2. 活跃流转任务产生真实托管载荷（经 API 创建 + multipart 上传；服务端会
  // 初始化带所有权标记的托管根）。
  const created = await adminAPI(page, 'POST', '/api/v1/transfers', { title: '运维观测包' })
  expect(created.status).toBe(200)
  const sendID = created.body.data.send.id
  const upload = await page.request.fetch(`${baseURL}/api/v1/transfers/${sendID}/files/upload`, {
    method: 'POST',
    headers: { cookie: (await adminLogin(page)).cookie, 'X-CSRF-Token': (await adminLogin(page)).csrf },
    multipart: {
      relative_path: 'observed.bin',
      file: { name: 'observed.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('OBSERVED') },
    },
  })
  expect(upload.status()).toBe(200)

  // 3. 生产漂移 B：在合法托管根内残留孤儿临时文件（模拟上传中断，mtime 拨到 2 小时前）。
  const managedTmp = join(team.dir, '.omnistore', 'transfer', 'send', 'tr-orphanleftover')
  mkdirSync(managedTmp, { recursive: true })
  const tmpFile = join(managedTmp, '.omnistore-upload-orphan1234.tmp')
  writeFileSync(tmpFile, 'partial upload')
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000)
  utimesSync(tmpFile, twoHoursAgo, twoHoursAgo)

  // 4. 状态聚合：源健康显示物理用量 > 台账用量（漂移未校准前），活跃任务 1。
  const statusBefore = await adminAPI(page, 'GET', '/api/v1/admin/operations/status')
  expect(statusBefore.status).toBe(200)
  const teamHealth = statusBefore.body.data.sources.find((item: { key: string }) => item.key === team.key)
  expect(teamHealth.root_accessible).toBe(true)
  expect(teamHealth.usage_bytes).toBeGreaterThan(teamHealth.ledger_bytes)
  expect(teamHealth.active_transfers).toBe(1)
  // 未定稿的包计入草稿（载荷字节照常统计）。
  expect(statusBefore.body.data.transfers.draft_sends).toBe(1)
  expect(statusBefore.body.data.transfers.active_sends).toBe(0)
  expect(statusBefore.body.data.transfers.payload_bytes).toBeGreaterThan(0)
  const capabilities = statusBefore.body.data.capabilities.map((item: { capability: string }) => item.capability)
  for (const capability of ['public_drive', 'image_bed', 'static_assets', 'transfer_center']) {
    expect(capabilities).toContain(capability)
  }

  // 5. UI：运维中心区块渲染 + 完整性检查通过。
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.goto('/app/admin?section=operations')
  await expect(page.getByRole('heading', { name: '运维中心' })).toBeVisible()
  await expect(page.getByText('quick_check:')).toContainText('ok')
  await expect(page.getByRole('row', { name: /团队文件/ })).toContainText('1') // 活跃流转
  await page.getByRole('button', { name: '完整性检查' }).click()
  await expect(page.getByText(/通过：integrity ok/)).toBeVisible({ timeout: 10_000 })

  // 6. 收敛漂移：盘外修改经台账校准（updated ≥ 1）。
  const reconcile = await adminAPI(page, 'POST', `/api/v1/admin/sources/${team.key}/reconcile`)
  expect(reconcile.status).toBe(200)
  expect(reconcile.body.data.updated + reconcile.body.data.added).toBeGreaterThanOrEqual(1)

  // 7. 清理编排：孤儿临时文件被移除（发送者撤销包后清扫载荷）。
  const cleanup = await adminAPI(page, 'POST', '/api/v1/admin/operations/cleanup')
  expect(cleanup.status).toBe(200)
  expect(cleanup.body.data.transfer_gc.orphan_temp_removed).toBeGreaterThanOrEqual(1)
  expect(() => readFileSync(tmpFile)).toThrow()

  // 撤销活跃包 → 载荷目录删除 → 再次清理显示清扫计数。
  await adminAPI(page, 'DELETE', `/api/v1/transfers/${sendID}`)
  const cleanup2 = await adminAPI(page, 'POST', '/api/v1/admin/operations/cleanup')
  expect(cleanup2.body.data.transfer_gc.transfers_swept).toBeGreaterThanOrEqual(1)
  expect(() => readFileSync(managedTmp)).toThrow()
  void cookie
  void writeFileSync
  void baseURL
})
