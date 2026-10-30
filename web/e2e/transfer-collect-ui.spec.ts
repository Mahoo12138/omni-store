import { expect, test, type Download, type Page } from '@playwright/test'

interface Collection { id: number; public_key: string; require_code: boolean }
interface Created { collection: Collection; code: string }
interface Submission { id: number; submitter_name: string; note: string; files: Array<{ id: number; relative_path: string }> }

async function login(page: Page, username = 'demo'): Promise<string> {
  const response = await page.request.post('/api/v1/auth/login', {
    data: { username, password: username === 'admin' ? 'OmniStore-Test-Admin!' : 'OmniStore-Test-Demo!' },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).data.csrf_token as string
}

async function openCollections(page: Page, path = '/transfer') {
  await page.goto(path)
  await page.getByRole('tab', { name: '收集文件', exact: true }).click()
  await expect(page.getByLabel('收集任务标题', { exact: true })).toBeVisible()
}

async function inbox(page: Page, id: number): Promise<Submission[]> {
  const response = await page.request.get(`/api/v1/transfer-collections/${id}/submissions`)
  expect(response.status()).toBe(200)
  return (await response.json()).data.items as Submission[]
}

async function close(page: Page, csrf: string, id: number | undefined) {
  if (id === undefined) return
  expect((await page.request.post(`/api/v1/transfer-collections/${id}/close`, { headers: { 'X-CSRF-Token': csrf } })).status()).toBe(200)
}

async function bytes(download: Download) {
  const stream = await download.createReadStream()
  expect(stream).not.toBeNull()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function openRecord(page: Page, title: string, id: number) {
  await page.getByRole('button', { name: '查看收发记录', exact: true }).click()
  await expect.poll(() => {
    const url = new URL(page.url())
    return [url.searchParams.get('view'), url.searchParams.get('record'), url.searchParams.get('id')]
  }).toEqual(['history', 'collect', String(id)])
  await expect(page.getByRole('tab', { name: '收发记录', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(page.getByTestId('transfer-code')).toHaveCount(0)
}

test('default collection opens directly, validates constraints, retries a failed submit and keeps owner-only records', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000)
  expect(baseURL).toBeTruthy()
  const csrf = await login(page)
  const visitor = await browser.newContext({ baseURL })
  const otherOwner = await browser.newContext({ baseURL })
  let id: number | undefined
  let savedTarget: { sourceKey: string; path: string } | undefined
  try {
    await openCollections(page)
    await page.getByLabel('收集任务标题', { exact: true }).fill('E2E 10 月作业收集')
    await page.getByLabel('收集任务说明', { exact: true }).fill('请提交第一周作业，仅 PDF。')
    await page.getByRole('button', { name: '收集设置', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: '启用收件码', exact: true })).not.toBeChecked()
    await page.getByRole('tab', { name: '收集信息', exact: true }).click()
    await page.getByRole('checkbox', { name: '要求提交者姓名', exact: true }).check()
    await page.getByRole('checkbox', { name: '要求提交备注', exact: true }).check()
    await page.getByRole('tab', { name: '文件', exact: true }).click()
    await page.getByLabel('单文件上限 MB', { exact: true }).fill('1')
    await page.getByLabel('总量上限 MB', { exact: true }).fill('2')
    await page.getByLabel('允许的扩展名', { exact: true }).fill('pdf')
    const creation = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/transfer-collections' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '生成收集链接', exact: true }).click()
    const response = await creation
    expect(response.status()).toBe(200)
    expect(response.request().postDataJSON()).toMatchObject({ require_code: false, require_name: true, require_note: true, allowed_exts: ['pdf'] })
    const created: Created = (await response.json()).data
    id = created.collection.id
    expect(created.collection.require_code).toBe(false)
    expect(created.code).toBe('')
    await expect(page.getByRole('heading', { name: '收集链接已生成', exact: true })).toBeVisible()
    const href = await page.getByRole('link', { name: '打开收集页面', exact: true }).getAttribute('href')
    expect(new URL(href!, baseURL).pathname).toBe(`/collect/${created.collection.public_key}`)
    await openRecord(page, 'E2E 10 月作业收集', id)
    await expect(page.getByText(/还没有收到提交/)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const publicPage = await visitor.newPage()
    await publicPage.goto(href!)
    await expect(publicPage.getByRole('heading', { name: 'E2E 10 月作业收集', exact: true })).toBeVisible()
    await expect(publicPage.getByLabel('收件码', { exact: true })).toHaveCount(0)
    await expect(publicPage.getByLabel('收集任务访问密码', { exact: true })).toHaveCount(0)
    await expect(publicPage.getByTestId('collect-upload-files')).toBeAttached()
    await publicPage.getByTestId('collect-upload-files').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not-pdf') })
    await publicPage.getByRole('button', { name: '提交文件', exact: true }).click()
    await expect(publicPage.getByRole('heading', { name: '提交成功', exact: true })).toHaveCount(0)
    expect(await publicPage.getByLabel('提交者姓名', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true)
    await publicPage.getByLabel('提交者姓名', { exact: true }).fill('小明')
    await publicPage.getByRole('button', { name: '提交文件', exact: true }).click()
    expect(await publicPage.getByLabel('提交备注', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true)
    await publicPage.getByLabel('提交备注', { exact: true }).fill('第一周作业')
    await publicPage.getByRole('button', { name: '提交文件', exact: true }).click()
    await expect(publicPage.getByText('收集者不接受此文件类型。', { exact: true })).toBeVisible()
    await expect(publicPage.getByRole('alert')).toContainText('请先处理文件列表中的问题')
    await publicPage.getByRole('button', { name: '移除 invalid.txt', exact: true }).click()
    await publicPage.getByTestId('collect-upload-files').setInputFiles([
      { name: 'small.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-small') },
      { name: 'too-large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(1024 * 1024 + 1, 'x') },
    ])
    await publicPage.getByRole('button', { name: '提交文件', exact: true }).click()
    await expect(publicPage.getByText(/超过单文件上限/)).toBeVisible()
    await expect(publicPage.getByRole('alert')).toContainText('请先处理文件列表中的问题')
    expect(await inbox(page, id)).toEqual([])
    await publicPage.getByRole('button', { name: '移除 small.pdf', exact: true }).click()
    await publicPage.getByRole('button', { name: '移除 too-large.pdf', exact: true }).click()
    const payload = Buffer.from('%PDF-homework-1\n中文内容')
    await publicPage.getByTestId('collect-upload-files').setInputFiles({ name: '第一周 作业.pdf', mimeType: 'application/pdf', buffer: payload })
    for (const width of [320, 375]) {
      await publicPage.setViewportSize({ width, height: 812 })
      expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await publicPage.screenshot({ path: `/tmp/omni-transfer-collect-${width}.png`, fullPage: true })
    }
    let failSubmit = true
    await publicPage.route('**/api/v1/public/transfer-collections/*/submit', async (route) => {
      if (!failSubmit) return route.continue()
      failSubmit = false
      await route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'E2E 提交暂未完成，请重试' } } })
    })
    await publicPage.getByRole('button', { name: '提交文件', exact: true }).click()
    await expect(publicPage.getByRole('alert')).toContainText('E2E 提交暂未完成，请重试')
    await expect(publicPage.getByText('第一周 作业.pdf', { exact: true })).toBeVisible()
    await expect(publicPage.getByRole('heading', { name: '提交成功', exact: true })).toHaveCount(0)
    expect(await inbox(page, id)).toEqual([])
    await publicPage.getByRole('button', { name: '提交文件', exact: true }).click()
    await expect(publicPage.getByRole('heading', { name: '提交成功', exact: true })).toBeVisible()
    await publicPage.unroute('**/api/v1/public/transfer-collections/*/submit')
    const submissions = await inbox(page, id)
    expect(submissions).toHaveLength(1)
    expect(submissions[0]).toMatchObject({ submitter_name: '小明', note: '第一周作业' })
    const submission = submissions[0]
    const ownerDownloadPath = `/api/v1/transfer-collections/${id}/submissions/${submission.id}/files/${submission.files[0].id}/download`
    expect((await publicPage.request.get(ownerDownloadPath)).status()).toBe(401)
    const otherPage = await otherOwner.newPage()
    await login(otherPage, 'admin')
    expect((await otherPage.request.get(`/api/v1/transfer-collections/${id}/submissions`)).status()).toBe(404)
    expect((await otherPage.request.get(ownerDownloadPath)).status()).toBe(404)
    expect((await publicPage.request.get(`/api/v1/public/transfer-collections/${created.collection.public_key}/submissions`)).status()).toBe(404)

    await page.getByRole('button', { name: '刷新记录', exact: true }).click()
    await expect(page.getByRole('button', { name: '下载 第一周 作业.pdf', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('小明', { exact: true })).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 第一周 作业.pdf', exact: true }).click()
    expect(await bytes(await download)).toEqual(payload)
    await page.getByRole('combobox', { name: '保存目标存储源', exact: true }).click()
    await page.getByRole('option', { name: '团队文件', exact: true }).click()
    const target = `from-collect-e2e-${id}`
    await page.getByLabel('保存目标目录', { exact: true }).fill(target)
    const saved = page.waitForResponse((result) => new URL(result.url()).pathname.endsWith(`/submissions/${submission.id}/save-to-files`) && result.request().method() === 'POST')
    await page.getByRole('button', { name: '保存到文件', exact: true }).click()
    const savedResponse = await saved
    expect(savedResponse.status()).toBe(200)
    savedTarget = { sourceKey: savedResponse.request().postDataJSON().source_key, path: target }
    await expect(page.getByRole('status').last()).toContainText('已保存 1 个文件')
    const copied = await page.request.get(`/api/v1/sources/${savedTarget.sourceKey}/download?path=${encodeURIComponent(`${target}/第一周 作业.pdf`)}`)
    expect(copied.status()).toBe(200)
    expect(await copied.body()).toEqual(payload)
    // Saving copies the payload; the original submission remains downloadable.
    expect(await (await page.request.get(ownerDownloadPath)).body()).toEqual(payload)
    await page.getByRole('button', { name: '关闭收集', exact: true }).click()
    await expect(page.getByText('已关闭', { exact: true }).first()).toBeVisible()
    id = undefined
    await page.reload()
    await expect(page.getByRole('button', { name: '下载 第一周 作业.pdf', exact: true })).toBeVisible()
    await publicPage.reload()
    await expect(publicPage.getByRole('heading', { name: '收集任务已关闭', exact: true })).toBeVisible()
  } finally {
    await close(page, csrf, id)
    if (savedTarget) {
      const removed = await page.request.delete(`/api/v1/sources/${savedTarget.sourceKey}/files?path=${encodeURIComponent(savedTarget.path)}`, { headers: { 'X-CSRF-Token': csrf } })
      expect(removed.status()).toBe(200)
    }
    await otherOwner.close()
    await visitor.close()
  }
})

for (const requireCode of [true, false]) test(`collection code and password are opt-in and wrong credentials never expose the submission form (code=${requireCode})`, async ({ page, browser, baseURL }) => {
  test.setTimeout(60_000)
  const csrf = await login(page)
  const title = requireCode ? 'E2E 双重保护收集' : 'E2E 仅密码保护收集'
  const visitor = await browser.newContext({ baseURL })
  let id: number | undefined
  try {
    await openCollections(page, '/transfer')
    await page.getByLabel('收集任务标题', { exact: true }).fill(title)
    await page.getByRole('button', { name: '收集设置', exact: true }).click()
    await page.getByRole('checkbox', { name: '启用收件码', exact: true }).setChecked(requireCode)
    await page.getByLabel('收集任务访问密码', { exact: true }).fill('Collect-Pass-1')
    await page.getByRole('tab', { name: '收集信息', exact: true }).click()
    await page.getByRole('checkbox', { name: '要求提交者姓名', exact: true }).check()
    const creation = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/transfer-collections' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '生成收集链接', exact: true }).click()
    const created: Created = (await (await creation).json()).data
    id = created.collection.id
    expect(created.collection.require_code).toBe(requireCode)
    if (requireCode) expect(created.code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/)
    else expect(created.code).toBe('')
    await expect(page.getByRole('heading', { name: '收集链接已生成', exact: true })).toBeVisible()
    if (requireCode) await expect(page.getByTestId('transfer-code')).toHaveText(created.code)
    else await expect(page.getByTestId('transfer-code')).toHaveCount(0)
    const href = await page.getByRole('link', { name: '打开收集页面', exact: true }).getAttribute('href')
    await openRecord(page, title, id)
    const history = await page.request.get('/api/v1/transfer-collections')
    if (requireCode) expect(await history.text()).not.toContain(created.code)

    const publicPage = await visitor.newPage()
    await publicPage.goto(href!)
    if (requireCode) await expect(publicPage.getByLabel('收件码', { exact: true })).toBeVisible()
    else await expect(publicPage.getByLabel('收件码', { exact: true })).toHaveCount(0)
    await expect(publicPage.getByLabel('收集任务访问密码', { exact: true })).toBeVisible()
    await expect(publicPage.getByTestId('collect-upload-files')).toHaveCount(0)
    if (requireCode) {
      await publicPage.getByLabel('收件码', { exact: true }).fill('XXXXXXXX')
      await publicPage.getByLabel('收集任务访问密码', { exact: true }).fill('Collect-Pass-1')
      await publicPage.getByRole('button', { name: '继续提交', exact: true }).click()
      await expect(publicPage.getByRole('alert')).toContainText('取件码不正确')
      await publicPage.getByLabel('收件码', { exact: true }).fill(created.code.toLowerCase())
    }
    await publicPage.getByLabel('收集任务访问密码', { exact: true }).fill('wrong-password')
    await publicPage.getByRole('button', { name: '继续提交', exact: true }).click()
    await expect(publicPage.getByRole('alert')).toContainText('密码不正确')
    await expect(publicPage.getByTestId('collect-upload-files')).toHaveCount(0)
    await publicPage.getByLabel('收集任务访问密码', { exact: true }).fill('Collect-Pass-1')
    await publicPage.getByRole('button', { name: '继续提交', exact: true }).click()
    await expect(publicPage.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await publicPage.getByLabel('提交者姓名', { exact: true }).fill('小红')
    await publicPage.getByTestId('collect-upload-files').setInputFiles({ name: 'answer.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-answer') })
    await publicPage.getByRole('button', { name: '提交文件', exact: true }).click()
    await expect(publicPage.getByRole('heading', { name: '提交成功', exact: true })).toBeVisible()
    expect(new URL(publicPage.url()).search).toBe('')
    expect((await visitor.cookies()).some((cookie) => /token/i.test(cookie.name))).toBe(false)
  } finally {
    await close(page, csrf, id)
    await visitor.close()
  }
})
