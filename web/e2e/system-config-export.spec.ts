import { expect, test } from '@playwright/test'
import { stat } from 'node:fs/promises'

test('seeded public demo and administrator config export are usable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '公开网盘' })).toBeVisible()
  await expect(page.getByRole('button', { name: '公开演示资料', exact: true })).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/app/admin?section=backup')
  await expect(page.getByRole('heading', { name: '导出系统配置包' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出配置包', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^omnistore-system-config-\d{8}T\d{6}Z\.zip$/)
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  expect((await stat(downloadPath!)).size).toBeGreaterThan(0)
  await expect(page.getByText(/已生成并下载 omnistore-system-config-/)).toBeVisible()
})
