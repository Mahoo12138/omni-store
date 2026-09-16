import { expect, test } from '@playwright/test'

test('anonymous visitor can browse, preview and download the public drive', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '公开网盘' })).toBeVisible()
  await page.getByRole('button', { name: '打开目录 公开演示资料' }).click()
  await expect(page).toHaveURL(/\/p\/demo$/)

  await expect(page.getByRole('row', { name: /README\.txt/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /guides/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'README.txt', exact: true })).toHaveAttribute('target', '_blank')
  const downloadLink = page.getByRole('link', { name: '下载 README.txt' })
  await expect(downloadLink).toHaveAttribute('href', '/raw/demo/README.txt?download=1')
  await expect(downloadLink).not.toHaveAttribute('target', '_blank')

  const filter = page.getByPlaceholder('搜索文件或文件夹')
  await filter.fill('README')
  await expect(page.getByRole('row', { name: /README\.txt/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /guides/ })).toHaveCount(0)
  await filter.clear()

  await page.getByRole('tab', { name: '网格视图' }).click()
  await expect(page.getByRole('tab', { name: '网格视图' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTitle('README.txt')).toBeVisible()
  await page.getByRole('tab', { name: '列表视图' }).click()

  await page.getByRole('button', { name: 'guides', exact: true }).click()
  await expect(page).toHaveURL(/\/p\/demo\/guides$/)
  await expect(page.getByRole('link', { name: 'getting-started.md', exact: true })).toBeVisible()
  await expect(page.getByText('公开目录仅支持预览和下载')).toBeVisible()
  await expect(page.getByRole('button', { name: '上传文件' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新建文件夹' })).toHaveCount(0)
})
