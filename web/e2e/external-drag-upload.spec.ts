import { expect, test } from '@playwright/test'

test('dropping multiple external files uploads them to the current folder', async ({ page }) => {
  const suffix = Date.now()
  const names = [`e2e-drop-a-${suffix}.txt`, `e2e-drop-b-${suffix}.txt`]
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()
  await page.getByRole('main', { name: '团队文件' }).waitFor()

  await page.evaluate((fileNames) => {
    const transfer = new DataTransfer()
    for (const name of fileNames) transfer.items.add(new File([`contents:${name}`], name, { type: 'text/plain' }))
    const dropSurface = document.querySelector('main[aria-label="团队文件"] > div')
    if (!dropSurface) throw new Error('file manager drop surface is missing')
    ;(window as Window & { __dropTransfer?: DataTransfer }).__dropTransfer = transfer
    dropSurface.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, names)

  await expect(page.getByText('松开以上传到当前目录')).toBeVisible()
  await page.screenshot({ path: '/tmp/omni-store-external-drag-active.png', fullPage: false })
  await page.evaluate(() => {
    const dropSurface = document.querySelector('main[aria-label="团队文件"] > div')
    const transfer = (window as Window & { __dropTransfer?: DataTransfer }).__dropTransfer
    if (!dropSurface || !transfer) throw new Error('drag state was not retained')
    dropSurface.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    dropSurface.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    delete (window as Window & { __dropTransfer?: DataTransfer }).__dropTransfer
  })
  await expect(page.getByText('松开以上传到当前目录')).toHaveCount(0)
  for (const name of names) await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible()
  await expect(page.getByRole('status', { name: '上传任务' })).toContainText('已上传 2 个文件')
  expect(pageErrors).toEqual([])
  await page.screenshot({ path: '/tmp/omni-store-external-drag-upload.png', fullPage: false })

  for (const name of names) {
    const row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: `更多操作 ${name}` }).click()
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    await page.getByRole('dialog', { name: '移入回收站' }).getByRole('button', { name: '移入回收站' }).click()
  }
  await page.getByRole('button', { name: '回收站' }).click()
  for (const name of names) {
    const row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: '永久删除' }).click()
    await page.getByRole('dialog', { name: '永久删除' }).getByRole('button', { name: '永久删除', exact: true }).click()
  }
})
