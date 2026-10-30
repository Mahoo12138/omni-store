import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
}

async function expectIconActionWithTooltip(page: Page, label: string) {
  const action = page.getByRole('button', { name: label, exact: true }).first()
  await expect(action).toBeVisible()
  // 操作列是图标按钮：32px 命中区、没有可见文字。
  await expect(action).toHaveText('')
  const box = await action.boundingBox()
  expect(box?.width).toBe(32)
  expect(box?.height).toBe(32)
  await action.hover()
  await expect(page.getByRole('tooltip')).toHaveText(label)
}

test('admin table action columns use icon-only buttons with tooltips', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await loginAsAdmin(page)

  await page.goto('/app/admin?section=policies')
  await expectIconActionWithTooltip(page, '编辑策略')
  await expectIconActionWithTooltip(page, '删除策略')

  await page.goto('/app/admin?section=users')
  await expectIconActionWithTooltip(page, '调整配额')

  await page.goto('/app/admin')
  await expectIconActionWithTooltip(page, '校准台账')
})
