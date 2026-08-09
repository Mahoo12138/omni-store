import { expect, test } from '@playwright/test'

const onePixelPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

test('user image can be uploaded, served from history and deleted', async ({ page }) => {
  const fileName = `e2e-image-${Date.now()}.png`

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('link', { name: '图床', exact: true }).click()
  await expect(page.getByRole('heading', { name: '图床', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '选择图床目标' })).toContainText('团队文件')

  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'image/png',
    buffer: onePixelPNG,
  })
  await expect(page.getByRole('status')).toContainText('1 张图片上传成功')

  const card = page.locator('article').filter({ hasText: fileName })
  await expect(card).toBeVisible()
  const image = card.getByRole('img', { name: fileName })
  await expect(image).toHaveAttribute('src', /\/t\/img_[a-f0-9]+\.jpg$/)
  const publicURL = await card.getByRole('link').first().getAttribute('href')
  expect(publicURL).toMatch(/^http:\/\/127\.0\.0\.1:18080\/i\/img_[a-f0-9]+\.png$/)
  const publicResponse = await page.request.get(publicURL!)
  expect(publicResponse.status()).toBe(200)
  expect(publicResponse.headers()['content-type']).toBe('image/png')

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    await dialog.accept()
  })
  await card.getByRole('button', { name: '删除图片' }).click()
  await expect(page.getByRole('status')).toContainText('图片已删除')
  await expect(card).toHaveCount(0)

  const deletedResponse = await page.request.get(publicURL!)
  expect(deletedResponse.status()).toBe(404)
})
