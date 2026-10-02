import { expect, test, type Page } from '@playwright/test'

// 2.0 Phase 5 流转中心 UI E2E：发送者全链路 + 匿名取件者双上下文。

const pickupCodePattern = /^[2-9A-HJKMNP-Z]{8}$/

async function loginAsDemo(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('link', { name: '流转' })).toBeVisible()
}

async function openTransferCenter(page: Page): Promise<void> {
  await page.getByRole('link', { name: '流转' }).click()
  await expect(page.getByRole('heading', { name: '流转中心' })).toBeVisible()
}

async function createDraftViaUI(page: Page, options: { title: string; password?: string }): Promise<string> {
  await openTransferCenter(page)
  await page.getByRole('button', { name: '新建发件包' }).click()
  const dialog = page.getByRole('dialog', { name: '新建发件包' })
  await dialog.getByLabel('发件包标题').fill(options.title)
  if (options.password) await dialog.getByLabel('访问密码').fill(options.password)
  await dialog.getByRole('button', { name: '创建草稿' }).click()

  // 取件码一次性弹层：读码并关闭。
  const once = page.getByRole('dialog', { name: '请立即保存取件码' })
  await expect(once).toBeVisible()
  const pickupCode = (await once.locator('code').first().textContent())!.trim()
  expect(pickupCode).toMatch(pickupCodePattern)
  await once.getByRole('button', { name: '保存并继续编辑' }).click()
  return pickupCode
}

test('sender creates, uploads and finalizes via UI; recipient picks up in a second browser', async ({ page, browser }) => {
  await loginAsDemo(page)
  await openTransferCenter(page)

  const pickupCode = await createDraftViaUI(page, { title: 'E2E UI 交付包' })

  // 草稿弹层：直传两个文件（含子目录相对路径）。
  const draft = page.getByRole('dialog', { name: /编辑发件包/ })
  await expect(draft.getByText('还没有文件')).toBeVisible()
  await draft.getByRole('button', { name: '上传文件', exact: true }).click()
  await page.getByTestId('transfer-upload-files').setInputFiles([
    { name: 'readme.txt', mimeType: 'text/plain', buffer: Buffer.from('README-CONTENT') },
  ])
  // 多文件选择器（multiple 属性的那个）。
  await page.getByTestId('transfer-upload-files').setInputFiles([
    { name: '报表.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-report') },
    { name: 'nested.txt', mimeType: 'text/plain', buffer: Buffer.from('NESTED') },
  ])
  await expect(draft.getByText('已包含 3 个文件')).toBeVisible()

  // 定稿并关闭草稿。
  await draft.getByRole('button', { name: '定稿并生成取件链接' }).click()
  await expect(page.getByRole('dialog', { name: /编辑发件包/ })).toBeHidden()

  // 列表显示进行中；复制链接按钮可见。
  const row = page.getByRole('article', { name: /E2E UI 交付包/ })
  await expect(row.getByText('进行中')).toBeVisible()
  await expect(row.getByRole('button', { name: '复制链接' })).toBeVisible()

  // 从列表拿公开链接（复制进剪贴板需要授权，改从二维码弹层读取 URL 文本）。
  await row.getByRole('button', { name: '二维码' }).click()
  const qr = page.getByRole('dialog', { name: /二维码/ })
  const qrURL = (await qr.locator('p').textContent())!.trim()
  expect(qrURL).toMatch(/\/pickup\/tr-[0-9a-f]{24}$/)
  await qr.getByRole('button', { name: '关闭二维码' }).click()

  const publicKey = qrURL.split('/pickup/')[1]

  // 匿名取件者：独立上下文（无 Cookie）。
  const recipientContext = await browser.newContext()
  const recipientPage = await recipientContext.newPage()
  await recipientPage.goto(`/pickup/${publicKey}`)
  await expect(recipientPage.getByRole('heading', { name: '取件' })).toBeVisible()

  // 错误取件码显示错误。
  await recipientPage.getByLabel('取件码').fill('XXXXXXXX')
  await recipientPage.getByRole('button', { name: '领取文件' }).click()
  await expect(recipientPage.getByRole('alert')).toContainText('取件码不正确')

  // 正确取件码（UI 输入自动转大写）。
  await recipientPage.getByLabel('取件码').fill(pickupCode.toLowerCase())
  await recipientPage.getByRole('button', { name: '领取文件' }).click()
  await expect(recipientPage.getByRole('heading', { name: 'E2E UI 交付包' })).toBeVisible()
  await expect(recipientPage.getByText('readme.txt')).toBeVisible()
  await expect(recipientPage.getByText('报表.pdf')).toBeVisible()

  // 单文件下载内容一致。
  const downloadPromise = recipientPage.waitForEvent('download')
  await recipientPage.getByRole('button', { name: '下载 readme.txt' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString('utf-8')).toBe('README-CONTENT')

  await recipientContext.close()

  // 发送者撤销后取件页显示不存在。
  await row.getByRole('button', { name: '撤销' }).click()
  await expect(row.getByText('已撤销')).toBeVisible()
  const revokedContext = await browser.newContext()
  const revokedPage = await revokedContext.newPage()
  await revokedPage.goto(`/pickup/${publicKey}`)
  await expect(revokedPage.getByRole('heading', { name: '发件包不存在或已撤销' })).toBeVisible()
  await revokedContext.close()
})

test('password protected package asks for password on the pickup page', async ({ page, browser }) => {
  await loginAsDemo(page)
  const pickupCode = await createDraftViaUI(page, {
    title: '加密交付包',
    password: 'Pickup-Pass-1',
  })

  const draft = page.getByRole('dialog', { name: /编辑发件包/ })
  await draft.getByRole('button', { name: '上传文件', exact: true }).click()
  await page.getByTestId('transfer-upload-files').setInputFiles([
    { name: 'secret.txt', mimeType: 'text/plain', buffer: Buffer.from('ENCRYPTED') },
  ])
  await draft.getByRole('button', { name: '定稿并生成取件链接' }).click()
  await expect(page.getByRole('dialog', { name: /编辑发件包/ })).toBeHidden()

  const row = page.getByRole('article', { name: /加密交付包/ })
  await row.getByRole('button', { name: '二维码' }).click()
  const qr = page.getByRole('dialog', { name: /二维码/ })
  const qrURL = (await qr.locator('p').textContent())!.trim()
  await qr.getByRole('button', { name: '关闭二维码' }).click()
  const publicKey = qrURL.split('/pickup/')[1]

  const recipientContext = await browser.newContext()
  const recipientPage = await recipientContext.newPage()
  await recipientPage.goto(`/pickup/${publicKey}`)
  // 有密码的包同时要求取件码与密码。
  await expect(recipientPage.getByLabel('访问密码')).toBeVisible()
  await recipientPage.getByLabel('取件码').fill(pickupCode)
  await recipientPage.getByRole('button', { name: '领取文件' }).click()
  await expect(recipientPage.getByRole('alert')).toContainText('密码不正确')
  await recipientPage.getByLabel('访问密码').fill('Pickup-Pass-1')
  await recipientPage.getByRole('button', { name: '领取文件' }).click()
  await expect(recipientPage.getByText('secret.txt')).toBeVisible()
  await recipientContext.close()
})
