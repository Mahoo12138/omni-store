import { expect, test } from '@playwright/test'

test('file browsing keeps its actions available on phones and narrow desktops', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 公开演示资料' }).click()

  const table = page.getByRole('table')
  await expect(table).toBeVisible()
  await expect(page.getByRole('button', { name: '收藏 demo.png' })).toBeVisible()
  expect(await table.evaluate((element) => element.parentElement!.scrollWidth <= element.parentElement!.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const checkbox = page.getByRole('checkbox', { name: '选择 demo.png' })
  expect(await checkbox.evaluate((element) => element.closest('label')!.getBoundingClientRect().width)).toBeGreaterThanOrEqual(44)
  await checkbox.check()
  await expect(page.getByText('已选择 1 项')).toBeVisible()

  await page.getByRole('tab', { name: '网格视图' }).click()
  await expect(page.getByRole('link', { name: 'demo.png', exact: true })).toHaveAttribute('href', /download/)
  await page.getByRole('button', { name: 'guides', exact: true }).click()
  await expect(page).toHaveURL(/path=%2Fguides/)

  await page.goto('/app/image-bed')
  await expect(page.getByRole('heading', { name: '图床', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.setViewportSize({ width: 1024, height: 760 })
  await page.goto('/app')
  await page.getByRole('button', { name: '打开存储源 公开演示资料' }).click()
  await page.getByRole('tab', { name: '列表视图' }).click()
  const desktopTable = page.getByRole('table')
  await expect(desktopTable).toBeVisible()
  expect(await desktopTable.evaluate((element) => element.parentElement!.scrollWidth <= element.parentElement!.clientWidth)).toBe(true)

  await page.setViewportSize({ width: 900, height: 760 })
  expect(await desktopTable.evaluate((element) => element.parentElement!.scrollWidth <= element.parentElement!.clientWidth)).toBe(true)
})
