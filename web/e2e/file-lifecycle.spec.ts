import { expect, test } from '@playwright/test'

test('uploaded file is searchable, recoverable and permanently removable', async ({ page }) => {
  const fileName = `e2e-lifecycle-${Date.now()}.txt`

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('OmniStore release lifecycle E2E\n'),
  })
  await expect(page.getByRole('status')).toContainText('已上传 1 个文件')
  let row = page.getByRole('row', { name: new RegExp(fileName) })
  await expect(row).toBeVisible()

  const fileManagerURL = page.url()
  const pageCount = page.context().pages().length
  const fileNameLink = row.getByRole('link', { name: fileName, exact: true })
  await expect(fileNameLink).not.toHaveAttribute('target', '_blank')
  const fileNameDownloadPromise = page.waitForEvent('download')
  await fileNameLink.click()
  const fileNameDownload = await fileNameDownloadPromise
  expect(fileNameDownload.suggestedFilename()).toBe(fileName)
  await expect.poll(() => page.context().pages().length).toBe(pageCount)
  await expect(page).toHaveURL(fileManagerURL)

  const downloadAction = row.getByRole('link', { name: `下载 ${fileName}`, exact: true })
  await expect(downloadAction).not.toHaveAttribute('target', '_blank')
  const actionDownloadPromise = page.waitForEvent('download')
  await downloadAction.click()
  const actionDownload = await actionDownloadPromise
  expect(actionDownload.suggestedFilename()).toBe(fileName)
  await expect.poll(() => page.context().pages().length).toBe(pageCount)
  await expect(page).toHaveURL(fileManagerURL)

  await page.getByRole('link', { name: '搜索', exact: true }).click()
  await page.getByLabel('搜索关键字').fill(fileName)
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  const result = page.locator('article').filter({ hasText: fileName })
  await expect(result).toBeVisible()
  await result.getByRole('button', { name: '打开所在目录' }).click()

  row = page.getByRole('row', { name: new RegExp(fileName) })
  await row.getByRole('button', { name: `更多操作 ${fileName}` }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await page.getByRole('dialog', { name: '移入回收站' }).getByRole('button', { name: '移入回收站' }).click()
  await expect(page.getByRole('status')).toContainText(`已将 ${fileName} 移入回收站`)
  await expect(row).toHaveCount(0)

  await page.getByRole('button', { name: '回收站' }).click()
  row = page.getByRole('row', { name: new RegExp(fileName) })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '恢复' }).click()
  await page.getByRole('dialog', { name: '恢复文件' }).getByRole('button', { name: '恢复', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(`已恢复 ${fileName}`)

  await page.getByRole('button', { name: '返回 团队文件' }).click()
  row = page.getByRole('row', { name: new RegExp(fileName) })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: `更多操作 ${fileName}` }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await page.getByRole('dialog', { name: '移入回收站' }).getByRole('button', { name: '移入回收站' }).click()

  await page.getByRole('button', { name: '回收站' }).click()
  row = page.getByRole('row', { name: new RegExp(fileName) })
  await row.getByRole('button', { name: '永久删除' }).click()
  await page.getByRole('dialog', { name: '永久删除' }).getByRole('button', { name: '永久删除' }).click()
  await expect(page.getByRole('status')).toContainText(`已永久删除 ${fileName}`)
  await expect(row).toHaveCount(0)
})
