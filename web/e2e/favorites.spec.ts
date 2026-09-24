import { expect, test } from '@playwright/test'

test('a directory can be favorited, opened from favorites, and removed', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  const folderName = `e2e-favorite-${Date.now()}`

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件', exact: true }).click()
  await expect(page.getByRole('heading', { name: '团队文件', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '创建文件夹' }).click()
  const createDialog = page.getByRole('dialog', { name: '新建文件夹' })
  await createDialog.getByLabel('目录名').fill(folderName)
  await createDialog.getByRole('button', { name: '创建', exact: true }).click()
  const sourceRow = page.getByRole('row', { name: new RegExp(folderName) })
  await expect(sourceRow).toBeVisible()
  await sourceRow.getByRole('button', { name: `收藏 ${folderName}` }).click()
  await expect(page.getByText('已添加到收藏。', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: '文件', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 公开演示资料', exact: true }).click()
  await expect(page.getByRole('heading', { name: '公开演示资料', exact: true })).toBeVisible()
  const publicFileRow = page.getByRole('row', { name: /README\.txt/ })
  const addPublicFavorite = page.waitForResponse((response) => response.url().includes('/api/v1/me/favorites') && response.request().method() === 'POST')
  const favoriteListReload = page.waitForResponse((response) => response.url().includes('/api/v1/me/favorites') && response.request().method() === 'GET')
  await publicFileRow.getByRole('button', { name: '收藏 README.txt' }).click()
  const publicFavoriteResponse = await addPublicFavorite
  expect(publicFavoriteResponse.ok()).toBe(true)
  expect(await publicFavoriteResponse.json()).toMatchObject({ data: { source_name: '公开演示资料', path: 'README.txt' } })
  await expect(page.getByText('已添加到收藏。', { exact: true })).toBeVisible()
  await favoriteListReload

  await page.getByRole('link', { name: '收藏', exact: true }).click()
  const favoriteRow = page.locator('article').filter({ has: page.getByRole('button', { name: folderName, exact: true }) })
  await expect(favoriteRow).toBeVisible()
  await expect(favoriteRow).toContainText('团队文件')
  const publicFavorite = page.locator('article').filter({ has: page.getByRole('button', { name: 'README.txt', exact: true }) })
  await expect(publicFavorite).toBeVisible()
  await expect(publicFavorite).toContainText('公开演示资料')
  await expect(page.getByText('已添加到收藏。', { exact: true })).toBeHidden({ timeout: 7_000 })
  await page.screenshot({ path: '/tmp/omni-store-favorites.png', fullPage: false })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: '收藏', exact: true })).toBeVisible()
  await expect(publicFavorite).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/omni-store-favorites-mobile.png', fullPage: false })
  await page.setViewportSize({ width: 1280, height: 720 })
  await favoriteRow.getByRole('button', { name: folderName, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/app/sources/[^?]+\\?path=%2F${folderName}`))

  await page.getByRole('link', { name: '收藏', exact: true }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    publicFavorite.getByRole('link', { name: '下载 README.txt' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('README.txt')
  await publicFavorite.getByRole('button', { name: 'README.txt', exact: true }).click()
  await expect(page.getByRole('heading', { name: '公开演示资料', exact: true })).toBeVisible()

  await page.getByRole('link', { name: '收藏', exact: true }).click()
  const listedPublicFavorite = page.locator('article').filter({ has: page.getByRole('button', { name: 'README.txt', exact: true }) })
  await listedPublicFavorite.getByRole('button', { name: '取消收藏 README.txt' }).click()
  await expect(listedPublicFavorite).toHaveCount(0)
  const listedFavorite = page.locator('article').filter({ has: page.getByRole('button', { name: folderName, exact: true }) })
  await listedFavorite.getByRole('button', { name: `取消收藏 ${folderName}` }).click()
  await expect(listedFavorite).toHaveCount(0)

  await page.getByRole('link', { name: '文件', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件', exact: true }).click()
  const cleanupRow = page.getByRole('row', { name: new RegExp(folderName) })
  await cleanupRow.getByRole('button', { name: `更多操作 ${folderName}` }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await page.getByRole('dialog', { name: '移入回收站' }).getByRole('button', { name: '移入回收站' }).click()
  await page.getByRole('button', { name: '回收站' }).click()
  const trashed = page.getByRole('row').filter({ has: page.getByText(folderName, { exact: true }) })
  await trashed.getByRole('button', { name: '永久删除' }).click()
  await page.getByRole('dialog', { name: '永久删除' }).getByRole('button', { name: '永久删除' }).click()
  await expect(trashed).toHaveCount(0)
  expect(browserErrors).toEqual([])
})
