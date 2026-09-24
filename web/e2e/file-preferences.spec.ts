import { expect, test } from '@playwright/test'

test('file view, page size and server-side sorting persist per source', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()

  await page.getByRole('tab', { name: '列表视图' }).click()
  const row = page.getByRole('row').nth(1)
  const checkbox = row.locator('input[type="checkbox"]')
  if (await checkbox.count()) await checkbox.check()

  const sortedRequest = page.waitForRequest((request) => {
    if (!request.url().includes('/api/v1/sources/') || !request.url().includes('/files?')) return false
    const url = new URL(request.url())
    return url.searchParams.get('sort') === 'size' && url.searchParams.get('order') === 'desc'
  })
  const sortedResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'GET'
      && url.pathname.includes('/api/v1/sources/')
      && url.pathname.endsWith('/files')
      && url.searchParams.get('sort') === 'size'
      && url.searchParams.get('order') === 'desc'
  })
  await page.getByRole('combobox', { name: '排序方式' }).click()
  await page.getByRole('option', { name: '大小降序' }).click()
  const request = await sortedRequest
  const response = await sortedResponse
  expect(new URL(request.url()).searchParams.get('path')).toBe('/')
  expect(response.ok()).toBeTruthy()
  const envelope = await response.json() as { data: { items: Array<{ type: string; size: number }> } }
  const result = envelope.data
  const fileSizes = result.items.filter((item) => item.type === 'file').map((item) => item.size)
  expect(fileSizes).toEqual([...fileSizes].sort((left, right) => right - left))
  await expect(page.getByRole('toolbar', { name: '批量文件操作' })).toHaveCount(0)

  await page.getByRole('tab', { name: '网格视图' }).click()
  await page.getByRole('combobox', { name: '每页条数' }).click()
  await page.getByRole('option', { name: '50 条/页' }).click()
  await expect(page.getByRole('tab', { name: '网格视图' })).toHaveAttribute('aria-selected', 'true')

  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) => entry.startsWith('omnistore:file-preferences:'))
    return key ? localStorage.getItem(key) : null
  })
  expect(stored).not.toBeNull()
  expect(JSON.parse(stored!)).toEqual({ view: 'grid', pageSize: 50, sort: 'size', order: 'desc' })

  await page.reload()
  await expect(page.getByRole('combobox', { name: '排序方式' })).toContainText('大小降序')
  await expect(page.getByRole('combobox', { name: '每页条数' })).toContainText('50 条/页')
  await expect(page.getByRole('tab', { name: '网格视图' })).toHaveAttribute('aria-selected', 'true')
  await page.screenshot({ path: '/tmp/omni-store-file-preferences.png', fullPage: false })
  expect(pageErrors).toEqual([])
})
