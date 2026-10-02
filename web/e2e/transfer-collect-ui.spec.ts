import { expect, test, type Page } from '@playwright/test'

// 2.0 Phase 6 收集任务 UI E2E：创建约束 → 匿名访客提交 → 收件箱 → 保存到文件。

async function loginAsDemo(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('link', { name: '流转' })).toBeVisible()
}

async function openCollections(page: Page): Promise<void> {
  await page.getByRole('link', { name: '流转' }).click()
  await expect(page.getByRole('heading', { name: '收集任务' })).toBeVisible()
}

test('collect full loop: create constraints, anonymous submit, inbox and save-to-files', async ({ page, browser }) => {
  await loginAsDemo(page)
  await openCollections(page)

  // 创建收集任务：要求姓名 + 只允许 pdf。
  await page.getByRole('button', { name: '新建收集任务' }).click()
  const dialog = page.getByRole('dialog', { name: '新建收集任务' })
  await dialog.getByLabel('收集任务标题').fill('10 月作业收集')
  await dialog.getByLabel('允许的扩展名').fill('pdf')
  await dialog.getByRole('checkbox', { name: '要求提交者姓名' }).setChecked(true)
  await dialog.getByRole('button', { name: '创建', exact: true }).click()

  // 收件码一次性弹层：读取码与链接。
  const once = page.getByRole('dialog', { name: '请立即保存取件码' })
  await expect(once).toBeVisible()
  const code = (await once.locator('code').first().textContent())!.trim()
  expect(code).toHaveLength(8)
  const link = (await once.locator('code').nth(1).textContent())!.trim()
  expect(link).toMatch(/\/collect\/tc-[0-9a-f]{24}$/)
  await once.getByRole('button', { name: '保存并继续编辑' }).click()

  // 收件箱（自动打开）：空态。
  const inbox = page.getByRole('dialog', { name: /收件箱/ })
  await expect(inbox.getByText('还没有收到提交')).toBeVisible()
  await inbox.getByRole('button', { name: '关闭', exact: true }).click()

  const publicKey = link.split('/collect/')[1]

  // 匿名访客（第二个上下文）：错误收件码 → 提交表单约束 → 成功提交。
  const visitor = await browser.newContext()
  const visitorPage = await visitor.newPage()
  await visitorPage.goto(`/collect/${publicKey}`)
  await expect(visitorPage.getByRole('heading', { name: '提交文件' })).toBeVisible()

  await visitorPage.getByLabel('收件码').fill('XXXXXXXX')
  await visitorPage.getByRole('button', { name: '继续提交' }).click()
  await expect(visitorPage.getByRole('alert')).toContainText('取件码不正确')

  await visitorPage.getByLabel('收件码').fill(code)
  await visitorPage.getByRole('button', { name: '继续提交' }).click()

  // 要求姓名：浏览器原生校验阻止提交（页面停留在表单，未进入成功态）。
  await visitorPage.getByTestId('collect-upload-files').setInputFiles([
    { name: 'homework.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-homework-1') },
  ])
  await visitorPage.getByRole('button', { name: '提交文件' }).click()
  // 仍停留在提交表单（未进入成功态）。
  await expect(visitorPage.getByRole('button', { name: '提交文件' })).toBeVisible()
  await expect(visitorPage.getByRole('heading', { name: '提交成功' })).toHaveCount(0)

  // 填姓名后提交成功。
  await visitorPage.getByLabel('提交者姓名').fill('小明')
  await visitorPage.getByRole('button', { name: '提交文件' }).click()
  await expect(visitorPage.getByRole('heading', { name: '提交成功' })).toContainText('提交成功')
  await expect(visitorPage.getByText('已收到你提交的 1 个文件')).toBeVisible()
  await visitor.close()

  // 发件者收件箱：显示提交与文件，下载内容一致。
  await openCollections(page)
  await page.getByRole('article', { name: /10 月作业收集/ }).getByRole('button', { name: '收件箱' }).click()
  const inbox2 = page.getByRole('dialog', { name: /收件箱/ })
  await expect(inbox2.getByText('小明')).toBeVisible()
  await expect(inbox2.getByText('homework.pdf')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await inbox2.getByRole('button', { name: '下载 homework.pdf' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString('utf-8')).toBe('%PDF-homework-1')

  // 保存到文件（复制语义）：选择目标源后保存。
  await inbox2.getByLabel('保存目标存储源').click()
  await page.getByRole('option', { name: '团队文件' }).click()
  await inbox2.getByLabel('保存目标目录').fill('from-collect')
  await inbox2.getByRole('button', { name: '保存到文件' }).click()
  await expect(page.getByRole('status').last()).toContainText('已保存 1 个文件')
  await inbox2.getByRole('button', { name: '关闭', exact: true }).click()

  // 关闭收集任务后：访客页显示已关闭。
  await page.getByRole('article', { name: /10 月作业收集/ }).getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('article', { name: /10 月作业收集/ }).getByText('已关闭')).toBeVisible()

  const closedVisitor = await browser.newContext()
  const closedPage = await closedVisitor.newPage()
  await closedPage.goto(`/collect/${publicKey}`)
  await expect(closedPage.getByRole('heading', { name: '收集任务已关闭' })).toBeVisible()
  await closedVisitor.close()
})

test('password protected collection requires both code and password', async ({ page, browser }) => {
  await loginAsDemo(page)
  await openCollections(page)

  await page.getByRole('button', { name: '新建收集任务' }).click()
  const dialog = page.getByRole('dialog', { name: '新建收集任务' })
  await dialog.getByLabel('收集任务标题').fill('带密码收集')
  await dialog.getByLabel('收集任务访问密码').fill('Collect-Pass-1')
  await dialog.getByRole('checkbox', { name: '要求提交者姓名' }).setChecked(true)
  await dialog.getByRole('button', { name: '创建', exact: true }).click()

  const once = page.getByRole('dialog', { name: '请立即保存取件码' })
  await expect(once).toBeVisible()
  const code = (await once.locator('code').first().textContent())!.trim()
  const link = (await once.locator('code').nth(1).textContent())!.trim()
  await once.getByRole('button', { name: '保存并继续编辑' }).click()
  await page.getByRole('dialog', { name: /收件箱/ }).getByRole('button', { name: '关闭', exact: true }).click()
  const publicKey = link.split('/collect/')[1]

  const visitor = await browser.newContext()
  const visitorPage = await visitor.newPage()
  await visitorPage.goto(`/collect/${publicKey}`)
  // 密码字段同时可见；只填码被拒。
  await expect(visitorPage.getByLabel('收集任务访问密码')).toBeVisible()
  await visitorPage.getByLabel('收件码').fill(code)
  await visitorPage.getByRole('button', { name: '继续提交' }).click()
  await expect(visitorPage.getByRole('alert')).toContainText('密码不正确')
  await visitorPage.getByLabel('收集任务访问密码').fill('Collect-Pass-1')
  await visitorPage.getByRole('button', { name: '继续提交' }).click()

  await visitorPage.getByTestId('collect-upload-files').setInputFiles([
    { name: 'answer.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-answer') },
  ])
  await visitorPage.getByLabel('提交者姓名').fill('小红')
  await visitorPage.getByRole('button', { name: '提交文件' }).click()
  await expect(visitorPage.getByRole('heading', { name: '提交成功' })).toBeVisible()
  await visitor.close()
})
