import { expect, test } from '@playwright/test'

test('private routes require login and logout invalidates the session', async ({ page }) => {
  await page.goto('/app/search')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('登录到你的存储中心')).toBeVisible()

  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('wrong-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('用户名或密码错误')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await expect(page.getByRole('link', { name: '系统设置' })).toHaveCount(0)

  await page.getByRole('button', { name: '账号菜单：演示用户' }).click()
  await page.getByRole('menuitem', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.goto('/app')
  await expect(page).toHaveURL(/\/login$/)
})
