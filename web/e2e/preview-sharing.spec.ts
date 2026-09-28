import { expect, test } from '@playwright/test'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('file manager opens unified preview modal for previewable files', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.getByRole('button', { name: '打开存储源 公开演示资料' }).click()

  // 文本预览：文件名点击打开弹层，内容来自统一渲染器。
  const row = page.getByRole('row', { name: /README\.txt/ })
  await row.getByRole('button', { name: 'README.txt', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '预览 README.txt' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('OmniStore public demo')
  await expect(dialog.getByRole('link', { name: '下载 README.txt' })).toHaveAttribute('href', /download=1/)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // 上下文菜单同样提供"预览"入口。
  await row.getByRole('button', { name: '更多操作 README.txt' }).click()
  await page.getByRole('menuitem', { name: '预览', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '预览 README.txt' })).toBeVisible()
  await page.keyboard.press('Escape')
})

test('directory share supports gallery view, streaming zip and qr code', async ({ page }) => {
  const folderName = `e2e-gallery-${Date.now()}`
  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()
  await page.getByRole('button', { name: '创建文件夹' }).click()
  const createDialog = page.getByRole('dialog', { name: '新建文件夹' })
  await createDialog.getByLabel('目录名').fill(folderName)
  await createDialog.getByRole('button', { name: '创建', exact: true }).click()
  const folderRow = page.getByRole('row', { name: new RegExp(folderName) })
  await expect(folderRow).toBeVisible()

  // 分享目录（无密码、不限次数）。目录行的"创建分享"是独立按钮。
  await folderRow.getByRole('button', { name: '创建分享' }).click()
  await page.getByRole('button', { name: '创建分享', exact: true }).click()
  const createdDialog = page.getByRole('dialog', { name: '分享已创建' })
  await expect(createdDialog).toBeVisible()
  const shareURL = new URL(await createdDialog.getByRole('textbox').inputValue())
  await createdDialog.getByRole('button', { name: '完成' }).click()

  // 上传两张图片到该目录。
  await folderRow.getByRole('button', { name: folderName, exact: true }).click()
  await expect(page).toHaveURL(/path=%2Fe2e-gallery-/)
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: PNG_1PX },
    { name: 'b.png', mimeType: 'image/png', buffer: PNG_1PX },
  ])
  await expect(page.getByRole('status', { name: '上传任务' })).toContainText('已上传 2 个文件')

  // 分享页：列表视图 + ZIP 打包入口。
  await page.goto(shareURL.pathname + shareURL.search)
  await expect(page.getByRole('heading', { name: folderName })).toBeVisible()
  const zipLink = page.getByRole('link', { name: '打包下载当前目录 ZIP' })
  await expect(zipLink).toHaveAttribute('href', /\/share\/shr-[a-f0-9]+\/archive/)

  // 画廊视图：两张图片，点击进入同一套预览弹层。
  await page.getByRole('button', { name: '画廊' }).click()
  const images = page.locator('button[aria-label^="预览图片 "]')
  await expect(images).toHaveCount(2)
  await images.first().click()
  const previewDialog = page.getByRole('dialog', { name: '预览 a.png' })
  await expect(previewDialog).toBeVisible()
  await expect(previewDialog.locator('img')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(previewDialog).toHaveCount(0)

  // 管理页二维码弹层。
  await page.goto('/app/shares')
  const shareCard = page.locator('article').filter({ hasText: folderName }).first()
  await shareCard.getByRole('button', { name: `查看 ${folderName} 的二维码` }).click()
  const qrDialog = page.getByRole('dialog', { name: `${folderName} 的二维码` })
  await expect(qrDialog.getByRole('img')).toBeVisible()
})
