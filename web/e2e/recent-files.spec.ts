import { expect, test } from '@playwright/test'

test('recent files tracks web file operations and offers download and folder navigation', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  const filename = `e2e-recent-${Date.now()}.txt`

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件', exact: true }).click()
  await expect(page.getByRole('heading', { name: '团队文件', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '上传文件' }).click()
  await page.locator('input[type="file"]').first().setInputFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from('recent file e2e'),
  })
  await expect(page.getByRole('row', { name: new RegExp(filename) })).toBeVisible()

  await page.getByRole('link', { name: '最近文件', exact: true }).click()
  const recentItem = page.locator('article').filter({ has: page.getByRole('button', { name: filename, exact: true }) })
  await expect(recentItem).toBeVisible()
  await expect(recentItem).toContainText('团队文件')
  await expect(recentItem).toContainText(filename)
  await page.screenshot({ path: '/tmp/omni-store-recent-files.png', fullPage: false })

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    recentItem.getByRole('link', { name: `下载 ${filename}` }).click(),
  ])
  expect(download.suggestedFilename()).toBe(filename)
  await expect(recentItem).toContainText(/最近操作/)

  await recentItem.getByRole('button', { name: filename, exact: true }).click()
  await expect(page).toHaveURL(/\/app\/sources\/[^/]+\?path=%2F/)
  await expect(page.getByRole('row', { name: new RegExp(filename) })).toBeVisible()

  const row = page.getByRole('row', { name: new RegExp(filename) })
  await row.getByRole('button', { name: `更多操作 ${filename}` }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await page.getByRole('dialog', { name: '移入回收站' }).getByRole('button', { name: '移入回收站' }).click()
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: '回收站' }).click()
  const trashed = page.getByRole('row').filter({ has: page.getByText(filename, { exact: true }) })
  await trashed.getByRole('button', { name: '永久删除' }).click()
  await page.getByRole('dialog', { name: '永久删除' }).getByRole('button', { name: '永久删除' }).click()
  await expect(trashed).toHaveCount(0)
  expect(browserErrors).toEqual([])
})
