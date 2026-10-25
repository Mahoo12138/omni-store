import { expect, test } from '@playwright/test'

test('probe nested backdrops', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/app')
  await page.goto('/app/admin?section=profile')
  const webdavEntry = page.getByRole('navigation', { name: '连接类型' }).getByRole('button', { name: '管理 WebDAV' })
  await expect(webdavEntry).toBeVisible()
  await webdavEntry.click()
  const webdavDialog = page.getByRole('dialog', { name: 'WebDAV', exact: true })
  await expect(webdavDialog).toBeVisible()
  const dump = async (label: string) => {
    const info = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-dialog-backdrop]')).map((el) => ({
        depth: el.getAttribute('data-dialog-depth'),
        bg: getComputedStyle(el).backgroundColor,
        childTags: Array.from(el.parentElement ? el.parentElement.children : []).map((c) => c.tagName).join(','),
      })),
    )
    console.log(`[${label}]`, JSON.stringify(info))
  }
  await dump('parent-open')
  const gen = webdavDialog.getByRole('button', { name: '生成 Token', exact: true })
  const reset = webdavDialog.getByRole('button', { name: '重置 Token', exact: true })
  if (await gen.isVisible()) {
    await gen.click()
    const revealed = page.getByRole('dialog', { name: '新的 Token', exact: true })
    await expect(revealed).toBeVisible()
    await dump('nested-open')
    await revealed.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(revealed).toBeHidden()
  }
  if (await reset.isVisible()) {
    await reset.click()
    const confirm = page.getByRole('dialog', { name: '重置 WebDAV' })
    await expect(confirm).toBeVisible()
    await dump('reset-open')
  }
})
