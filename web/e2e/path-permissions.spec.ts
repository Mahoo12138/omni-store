import { expect, test } from '@playwright/test'

test('seeded path policy updates file manager capabilities by directory', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()
  await expect(page.getByText('当前目录可读写', { exact: true })).toBeVisible()
  await expect(page.getByText(/\/ 128 MB$/)).toBeVisible()
  await expect(page.getByRole('button', { name: '上传文件' })).toBeVisible()
  await expect(page.getByRole('button', { name: '创建文件夹' })).toBeVisible()

  await page.getByRole('button', { name: 'projects', exact: true }).click()
  await expect(page).toHaveURL(/path=%2Fprojects/)
  await expect(page.getByText('当前目录只读', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '上传文件' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '创建文件夹' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重命名' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '移动' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '删除' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'roadmap.md', exact: true })).toBeVisible()
})
