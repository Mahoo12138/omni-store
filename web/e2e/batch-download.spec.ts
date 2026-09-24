import { expect, test } from '@playwright/test'

test('selected files and directories download as one archive', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()

  const selectable = page.locator('tbody input[type="checkbox"]:not(:disabled)')
  await expect(selectable.nth(1)).toBeVisible()
  await selectable.nth(0).check()
  await selectable.nth(1).check()
  const toolbar = page.getByRole('toolbar', { name: '批量文件操作' })
  await expect(toolbar).toContainText('已选择 2 项')
  await page.screenshot({ path: '/tmp/omni-store-batch-download-selected.png', fullPage: false })

  const archiveResponse = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && response.url().includes('/download/archive')
  ))
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    toolbar.getByRole('button', { name: '下载', exact: true }).click(),
  ])
  const response = await archiveResponse
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/zip')
  expect(download.suggestedFilename()).toMatch(/^omnistore-download-\d{8}T\d{6}Z\.zip$/)
  await expect(page.getByText('已开始下载 2 项。', { exact: true })).toBeVisible()
  await expect(toolbar).toHaveCount(0)
  await page.screenshot({ path: '/tmp/omni-store-batch-download.png', fullPage: false })
  expect(browserErrors).toEqual([])
})
