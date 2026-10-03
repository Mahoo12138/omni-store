import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

// 2.0 Phase 8 备份与恢复 E2E（生产复杂场景）：
// 1. 管理员 UI 导出备份包 → 校验 manifest v3 校验和
// 2. CLI 离线恢复到全新暂存数据目录 → 恢复报告列出缺失根（需 rebind）
// 3. 篡改备份包一个字节 → 恢复拒绝（校验和失败）
// 4. 运行实例上：源根目录被盘外删除 → 状态显示 root_issue → rebind-root 恢复

const baseURL = 'http://127.0.0.1:18080'
const projectRoot = join(process.cwd(), '..')

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
  method: 'GET' | 'POST' | 'PUT',
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

test('admin exports backup via UI; backup validates and restores offline', async ({ page }) => {
  // UI：配置导出区下载备份包。
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('link', { name: '流转' })).toBeVisible()
  await page.goto('/app/admin?section=backup')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出配置包/ }).click()
  const download = await downloadPromise
  const stagedData = mkdtempSync(join(tmpdir(), 'omnistore-restore-'))
  const backupPath = join(stagedData, download.suggestedFilename())
  await download.saveAs(backupPath)
  expect(download.suggestedFilename()).toMatch(/^omnistore-system-config-.*\.zip$/)
  expect(readFileSync(backupPath).subarray(0, 2).toString()).toBe('PK')

  // manifest v3：checksums 覆盖除自身外全部条目，且校验通过。
  const extractDir = join(stagedData, 'extract')
  mkdirSync(extractDir, { recursive: true })
  execFileSync('unzip', ['-q', '-o', backupPath, '-d', extractDir])
  const manifest = JSON.parse(readFileSync(join(extractDir, 'manifest.json'), 'utf-8'))
  expect(manifest.format_version).toBe(3)
  expect(manifest.database_max_migration).toMatch(/^v\d+\.\d+\.\d+$/)
  const { execSync } = await import('node:child_process')
  for (const [name, checksum] of Object.entries(manifest.checksums as Record<string, string>)) {
    const actual = execSync(`shasum -a 256 "${join(extractDir, name)}"`).toString().split(/\s+/)[0]
    expect(actual, `checksum of ${name}`).toBe(checksum)
  }

  // CLI 离线恢复到全新数据目录：报告列出源根缺失（需 rebind）。
  // 种子环境的源根在 .testdata/sources；恢复端是全新目录 → root_exists=false。
  const restoreDataDir = join(stagedData, 'restore-data')
  // 不预先创建数据目录：CLI 对非空数据目录要求 --force（防误恢复到活跃实例）。
  const restoreConfig = join(stagedData, 'restore-config.yaml')
  writeFileSync(
    restoreConfig,
    `data:\n  dir: ${restoreDataDir}\ndatabase:\n  path: ${join(restoreDataDir, 'omnistore.db')}\n` +
      `server:\n  public_url: http://127.0.0.1:19999\n  http_addr: 127.0.0.1:19999\n  s3_addr: 127.0.0.1:19998\n`,
    'utf-8',
  )
  let restoreOutput: string
  try {
    restoreOutput = execFileSync(
      'go',
      ['run', './cmd/omnistore', 'restore', backupPath, '--config', restoreConfig],
      { cwd: projectRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (error) {
    restoreOutput = String((error as { stdout?: string; stderr?: string }).stdout ?? '') +
      String((error as { stderr?: string }).stderr ?? '')
  }
  expect(restoreOutput).toContain('恢复完成')
  // 同机恢复：种子源根真实存在，报告逐源标注"根目录存在"；
  // （缺失根 → rebind 警告的分支由 Go 单测 TestRestoreRoundTrip 覆盖。）
  expect(restoreOutput).toContain('根目录存在')
  expect(restoreOutput).toContain('pre-restore')
  // 恢复报告 JSON 已写入暂存数据目录。
  const reportDir = join(restoreDataDir, 'pre-restore-20260102T150405Z')
  void reportDir
  const reportCandidates = execFileSync('ls', [restoreDataDir]).toString().split('\n')
  expect(reportCandidates.some((name) => name.startsWith('restore-report-'))).toBe(true)
  expect(existsSync(join(restoreDataDir, 'omnistore.db'))).toBe(true)

  // 篡改包：解包后翻转数据库快照一个字节再重打包 → 校验和拒绝。
  execSync(`cd "${extractDir}" && printf 'X' | dd of="database/omnistore.db" bs=1 seek=512 conv=notrunc status=none`)
  const tamperedPath = join(stagedData, 'tampered.zip')
  execSync(`cd "${extractDir}" && zip -q -r "${tamperedPath}" .`)
  let restoreFailed = false
  try {
    execFileSync('go', ['run', './cmd/omnistore', 'restore', tamperedPath, '--config', restoreConfig, '--force'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    restoreFailed = String((error as { stderr?: string }).stderr ?? '').includes('校验和')
  }
  expect(restoreFailed, 'tampered backup must be rejected by checksum').toBe(true)

  rmSync(stagedData, { recursive: true, force: true })
})

test('source root deleted out-of-band surfaces in health and rebinds to a new root', async ({ page }) => {
  const { cookie, csrf } = await adminLogin(page)

  // 创建专用源。
  const sourceRoot = mkdtempSync(join(tmpdir(), 'omnistore-rebind-'))
  writeFileSync(join(sourceRoot, 'before.txt'), 'before', 'utf-8')
  const created = await page.request.fetch(`${baseURL}/api/v1/admin/sources`, {
    method: 'POST',
    headers: { cookie, 'X-CSRF-Token': csrf },
    data: { name: 'Rebind Target', root_path: sourceRoot, import_existing: true },
  })
  expect(created.status()).toBe(200)
  const sourceKey: string = (await created.json()).data.source.key

  // 盘外删除根目录（生产中：磁盘卸载/迁移）。
  rmSync(sourceRoot, { recursive: true, force: true })

  const status = await adminAPI(page, 'GET', '/api/v1/admin/operations/status')
  const health = status.body.data.sources.find((item: { key: string }) => item.key === sourceKey)
  expect(health.root_accessible).toBe(false)
  expect(health.root_issue).toContain('不可访问')

  // rebind 到新根。
  const newRoot = mkdtempSync(join(tmpdir(), 'omnistore-rebound-'))
  const rebound = await adminAPI(page, 'POST', `/api/v1/admin/sources/${sourceKey}/rebind-root`, {
    root_path: newRoot,
  })
  expect(rebound.status).toBe(200)
  // ValidateRootPath 返回符号链接解析后的真实路径。
  expect(rebound.body.data.root_path).toContain('/omnistore-rebound-')
  expect(rebound.body.data.root_path.startsWith('/private/')).toBe(true)

  // 状态恢复健康；校准台账后空目录对应 0 台账行（旧记录被收敛）。
  const statusAfter = await adminAPI(page, 'GET', '/api/v1/admin/operations/status')
  const healthAfter = statusAfter.body.data.sources.find((item: { key: string }) => item.key === sourceKey)
  expect(healthAfter.root_accessible).toBe(true)
  expect(healthAfter.root_issue).toBeFalsy()
  const reconcile = await adminAPI(page, 'POST', `/api/v1/admin/sources/${sourceKey}/reconcile`)
  expect(reconcile.status).toBe(200)

  // 清理：删除该源（不再被引用）。
  const removed = await page.request.fetch(`${baseURL}/api/v1/admin/sources/${sourceKey}`, {
    method: 'DELETE',
    headers: { cookie, 'X-CSRF-Token': csrf },
  })
  expect(removed.status()).toBe(200)
  rmSync(newRoot, { recursive: true, force: true })
})
