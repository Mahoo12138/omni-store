import { expect, test } from '@playwright/test'

test('password-protected file share can be created, opened and revoked', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.getByRole('button', { name: '打开存储源 公开演示资料' }).click()
  const fileRow = page.getByRole('row', { name: /README\.txt/ })
  await fileRow.getByRole('button', { name: '更多操作 README.txt' }).click()
  await page.getByRole('menuitem', { name: '创建分享', exact: true }).click()
  await page.getByPlaceholder('留空表示无需密码').fill('e2e-share')
  await page.getByRole('spinbutton').fill('2')
  await page.getByRole('button', { name: '创建分享', exact: true }).click()

  const createdDialog = page.getByRole('dialog', { name: '分享已创建' })
  await expect(createdDialog).toBeVisible()
  const shareURL = await createdDialog.getByRole('textbox').inputValue()
  const shareLocation = new URL(shareURL)
  expect(shareLocation.origin).toBe(new URL(page.url()).origin)
  expect(shareLocation.pathname).toMatch(/^\/s\/shr-[a-f0-9]+$/)

  await page.goto(shareURL)
  await expect(page.getByRole('heading', { name: '此分享受密码保护' })).toBeVisible()
  await page.getByRole('textbox', { name: '访问密码' }).fill('wrong-password')
  await page.getByRole('button', { name: '查看分享' }).click()
  await expect(page.getByRole('alert')).toContainText('访问密码错误')

  await page.getByRole('textbox', { name: '访问密码' }).fill('e2e-share')
  await page.getByRole('button', { name: '查看分享' }).click()
  await expect(page.getByRole('heading', { name: 'README.txt' })).toBeVisible()
  const downloadLink = page.getByRole('link', { name: '下载文件' })
  await expect(downloadLink).toHaveAttribute('href', /\/share\/shr-[a-f0-9]+\/raw\?download=1$/)
  await expect(downloadLink).not.toHaveAttribute('target', '_blank')

  await page.goto('/app/shares')
  const newestShare = page.locator('article').first()
  await expect(newestShare).toContainText('README.txt')
  await newestShare.getByRole('button', { name: /撤销 README\.txt 的分享/ }).click()
  await page.getByRole('dialog', { name: '撤销分享' }).getByRole('button', { name: '撤销分享' }).click()

  await page.goto(shareURL)
  await expect(page.getByRole('heading', { name: '分享不存在或已失效' })).toBeVisible()
})
