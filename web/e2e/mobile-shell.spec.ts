import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
}

test('mobile shell uses a logo drawer and an avatar menu instead of the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await loginAsAdmin(page)

  const brand = page.getByRole('button', { name: '打开导航', exact: true })
  const avatar = page.getByRole('button', { name: '账号菜单：测试管理员', exact: true })
  await expect(brand).toBeVisible()
  await expect(avatar).toBeVisible()
  await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeHidden()

  await avatar.click()
  await expect(page.getByRole('menuitem', { name: '外观', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem', { name: '外观', exact: true })).toHaveCount(0)

  await brand.click()
  const drawerNav = page.getByRole('navigation', { name: '主导航', exact: true })
  await expect(drawerNav).toBeVisible()
  await expect(drawerNav.getByRole('link', { name: '系统设置', exact: true })).toBeVisible()
  await drawerNav.getByRole('link', { name: '账户设置', exact: true }).click()

  await expect(page).toHaveURL(/\/app\/settings/)
  await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: '账号菜单：测试管理员', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('desktop shell keeps the sidebar and hides the mobile header trigger', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await loginAsAdmin(page)

  await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开导航', exact: true })).toBeHidden()
})
