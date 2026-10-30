import { expect, test, type Download, type Page } from '@playwright/test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface Send { id: number; public_key: string; require_code: boolean; status: string; total_files: number }
interface Created { send: Send; pickup_code: string }
interface TransferFile { id: number; relative_path: string }

async function login(page: Page): Promise<string> {
  const response = await page.request.post('/api/v1/auth/login', {
    data: { username: 'demo', password: 'OmniStore-Test-Demo!' },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).data.csrf_token as string
}

async function openSend(page: Page, path = '/transfer') {
  await page.goto(path)
  await expect(page.getByRole('tab', { name: '发送文件', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('发件包标题', { exact: true })).toBeVisible()
}

async function files(page: Page, id: number): Promise<TransferFile[]> {
  const response = await page.request.get(`/api/v1/transfers/${id}/files`)
  expect(response.status()).toBe(200)
  return (await response.json()).data.items as TransferFile[]
}

async function revoke(page: Page, csrf: string, id: number | undefined) {
  if (id === undefined) return
  expect((await page.request.delete(`/api/v1/transfers/${id}`, { headers: { 'X-CSRF-Token': csrf } })).status()).toBe(200)
}

async function bytes(download: Download) {
  const stream = await download.createReadStream()
  expect(stream).not.toBeNull()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function expectHistory(page: Page, title: string, id: number) {
  await page.getByRole('button', { name: '查看收发记录', exact: true }).click()
  await expect.poll(() => {
    const url = new URL(page.url())
    return [url.searchParams.get('view'), url.searchParams.get('record'), url.searchParams.get('id')]
  }).toEqual(['history', 'send', String(id)])
  await expect(page.getByRole('tab', { name: '收发记录', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(page.getByTestId('transfer-code')).toHaveCount(0)
}

test('send files and a real nested folder, reopen the record, download anonymously and revoke', async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000)
  expect(baseURL).toBeTruthy()
  const csrf = await login(page)
  const temp = await mkdtemp(join(tmpdir(), 'omni-send-e2e-'))
  const folder = join(temp, '交付资料')
  await mkdir(join(folder, '2026 方案'), { recursive: true })
  await writeFile(join(folder, '2026 方案', '最终版 v2.pdf'), '%PDF-真实目录内容')
  const recipient = await browser.newContext({ baseURL })
  let id: number | undefined
  try {
    await openSend(page)
    await page.getByLabel('发件包标题', { exact: true }).fill('E2E UI 交付包 · 中文与目录')
    await page.getByLabel('发件包说明', { exact: true }).fill('文件与文件夹一起发送，刷新后仍可读取记录。')
    await page.getByRole('button', { name: '发送设置', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: '启用取件码', exact: true })).not.toBeChecked()
    await page.getByTestId('transfer-upload-files').setInputFiles({ name: 'readme.txt', mimeType: 'text/plain', buffer: Buffer.from('README-CONTENT') })
    await page.getByTestId('transfer-upload-folder').setInputFiles(folder)
    // Changing the main tab must preserve both independent, unsaved composers.
    await page.getByRole('tab', { name: '收集文件', exact: true }).click()
    await page.getByLabel('收集任务标题', { exact: true }).fill('切换 Tab 时保留的收集草稿')
    await page.getByLabel('收集任务说明', { exact: true }).fill('尚未生成链接，不应因为查看发送草稿而丢失。')
    await page.getByRole('tab', { name: '发送文件', exact: true }).click()
    await expect(page.getByLabel('发件包标题', { exact: true })).toHaveValue('E2E UI 交付包 · 中文与目录')
    await expect(page.getByRole('list', { name: '已选文件', exact: true })).toContainText('readme.txt')
    await expect(page.getByRole('list', { name: '已选文件', exact: true })).toContainText('交付资料/2026 方案/最终版 v2.pdf')
    await page.getByRole('tab', { name: '收集文件', exact: true }).click()
    await expect(page.getByLabel('收集任务标题', { exact: true })).toHaveValue('切换 Tab 时保留的收集草稿')
    await expect(page.getByLabel('收集任务说明', { exact: true })).toHaveValue('尚未生成链接，不应因为查看发送草稿而丢失。')
    await page.getByRole('tab', { name: '发送文件', exact: true }).click()
    const creation = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/transfers' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '发送文件', exact: true }).click()
    const response = await creation
    expect(response.status()).toBe(200)
    expect(response.request().postDataJSON().require_code).toBe(false)
    const created: Created = (await response.json()).data
    id = created.send.id
    expect(created.pickup_code).toBe('')
    expect(created.send.require_code).toBe(false)
    await expect(page.getByRole('heading', { name: '文件已发送', exact: true })).toBeVisible()
    const href = await page.getByRole('link', { name: '打开取件页面', exact: true }).getAttribute('href')
    expect(new URL(href!, baseURL).pathname).toBe(`/pickup/${created.send.public_key}`)
    expect((await files(page, id)).map((file) => file.relative_path).sort()).toEqual(['readme.txt', '交付资料/2026 方案/最终版 v2.pdf'])
    await expectHistory(page, 'E2E UI 交付包 · 中文与目录', id)
    await expect(page.getByRole('link', { name: '打开取件页面', exact: true })).toBeVisible()

    const publicPage = await recipient.newPage()
    await publicPage.goto(href!)
    await expect(publicPage.getByRole('heading', { name: 'E2E UI 交付包 · 中文与目录', exact: true })).toBeVisible()
    await expect(publicPage.getByLabel('取件码', { exact: true })).toHaveCount(0)
    await expect(publicPage.getByLabel('访问密码', { exact: true })).toHaveCount(0)
    for (const width of [320, 375]) {
      await publicPage.setViewportSize({ width, height: 812 })
      expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await publicPage.screenshot({ path: `/tmp/omni-transfer-pickup-${width}.png`, fullPage: true })
    }
    const download = publicPage.waitForEvent('download')
    await publicPage.getByRole('button', { name: '下载 readme.txt', exact: true }).click()
    expect(await bytes(await download)).toEqual(Buffer.from('README-CONTENT'))
    const folderDownload = publicPage.waitForEvent('download')
    await publicPage.getByRole('button', { name: '下载 交付资料/2026 方案/最终版 v2.pdf', exact: true }).click()
    expect(await bytes(await folderDownload)).toEqual(Buffer.from('%PDF-真实目录内容'))

    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(page.getByText('已撤销', { exact: true }).first()).toBeVisible()
    id = undefined
    await publicPage.reload()
    await expect(publicPage.getByRole('heading', { name: '发件包不存在或已撤销', exact: true })).toBeVisible()
  } finally {
    await revoke(page, csrf, id)
    await recipient.close()
    await rm(temp, { recursive: true, force: true })
  }
})

for (const requireCode of [true, false]) test(`optional pickup code and password reject wrong credentials and remain absent from persisted history (code=${requireCode})`, async ({ page, browser, baseURL }) => {
  test.setTimeout(60_000)
  const csrf = await login(page)
  const title = requireCode ? 'E2E 双重保护交付' : 'E2E 仅密码保护交付'
  const recipient = await browser.newContext({ baseURL })
  let id: number | undefined
  try {
    await openSend(page, '/transfer')
    await page.getByLabel('发件包标题', { exact: true }).fill(title)
    await page.getByRole('button', { name: '发送设置', exact: true }).click()
    await page.getByRole('checkbox', { name: '启用取件码', exact: true }).setChecked(requireCode)
    await page.getByLabel('访问密码', { exact: true }).fill('Pickup-Pass-1')
    await page.getByRole('tab', { name: '文件', exact: true }).click()
    await page.getByLabel('下载次数上限', { exact: true }).fill('3')
    await page.getByTestId('transfer-upload-files').setInputFiles({ name: 'secret.txt', mimeType: 'text/plain', buffer: Buffer.from('ENCRYPTED') })
    const creation = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/transfers' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '发送文件', exact: true }).click()
    const created: Created = (await (await creation).json()).data
    id = created.send.id
    expect(created.send.require_code).toBe(requireCode)
    if (requireCode) expect(created.pickup_code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/)
    else expect(created.pickup_code).toBe('')
    await expect(page.getByRole('heading', { name: '文件已发送', exact: true })).toBeVisible()
    if (requireCode) await expect(page.getByTestId('transfer-code')).toHaveText(created.pickup_code)
    else await expect(page.getByTestId('transfer-code')).toHaveCount(0)
    const href = await page.getByRole('link', { name: '打开取件页面', exact: true }).getAttribute('href')
    await expectHistory(page, title, id)
    const history = await page.request.get('/api/v1/transfers')
    expect(history.status()).toBe(200)
    if (requireCode) expect(await history.text()).not.toContain(created.pickup_code)

    const publicPage = await recipient.newPage()
    await publicPage.goto(href!)
    if (requireCode) await expect(publicPage.getByLabel('取件码', { exact: true })).toBeVisible()
    else await expect(publicPage.getByLabel('取件码', { exact: true })).toHaveCount(0)
    await expect(publicPage.getByLabel('访问密码', { exact: true })).toBeVisible()
    if (requireCode) {
      await publicPage.getByLabel('取件码', { exact: true }).fill('XXXXXXXX')
      await publicPage.getByLabel('访问密码', { exact: true }).fill('Pickup-Pass-1')
      await publicPage.getByRole('button', { name: '领取文件', exact: true }).click()
      await expect(publicPage.getByRole('alert')).toContainText('取件码不正确')
      await publicPage.getByLabel('取件码', { exact: true }).fill(created.pickup_code.toLowerCase())
    }
    await publicPage.getByLabel('访问密码', { exact: true }).fill('wrong-password')
    await publicPage.getByRole('button', { name: '领取文件', exact: true }).click()
    await expect(publicPage.getByRole('alert')).toContainText('密码不正确')
    await publicPage.getByLabel('访问密码', { exact: true }).fill('Pickup-Pass-1')
    await publicPage.getByRole('button', { name: '领取文件', exact: true }).click()
    await expect(publicPage.getByRole('heading', { name: title, exact: true })).toBeVisible()
    const download = publicPage.waitForEvent('download')
    await publicPage.getByRole('button', { name: '下载 secret.txt', exact: true }).click()
    expect(await bytes(await download)).toEqual(Buffer.from('ENCRYPTED'))
    expect(new URL(publicPage.url()).search).toBe('')
    expect((await recipient.cookies()).some((cookie) => /token/i.test(cookie.name))).toBe(false)
  } finally {
    await revoke(page, csrf, id)
    await recipient.close()
  }
})

test('partial upload failure keeps the draft and retries only unfinished files before finalizing', async ({ page }) => {
  test.setTimeout(60_000)
  const csrf = await login(page)
  let id: number | undefined
  let uploadAttempts = 0
  let finalizeCalls = 0
  let releaseUpload: (() => void) | undefined
  const heldUpload = new Promise<void>((resolve) => { releaseUpload = resolve })
  await page.route('**/api/v1/transfers/*/files/upload', async (route) => {
    uploadAttempts++
    if (uploadAttempts === 2) {
      await route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'E2E 第二个文件暂未上传' } } })
      return
    }
    if (uploadAttempts === 3) await heldUpload
    await route.continue()
  })
  page.on('request', (request) => {
    if (/\/api\/v1\/transfers\/\d+\/finalize$/.test(new URL(request.url()).pathname)) finalizeCalls++
  })
  try {
    await openSend(page)
    await page.getByLabel('发件包标题', { exact: true }).fill('E2E 部分成功恢复')
    await page.getByTestId('transfer-upload-files').setInputFiles([
      { name: 'first.txt', mimeType: 'text/plain', buffer: Buffer.from('FIRST') },
      { name: 'second.txt', mimeType: 'text/plain', buffer: Buffer.from('SECOND') },
    ])
    const creation = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/transfers' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '发送文件', exact: true }).click()
    const created: Created = (await (await creation).json()).data
    id = created.send.id
    await expect(page.getByRole('alert')).toContainText('E2E 第二个文件暂未上传')
    await expect(page.getByRole('heading', { name: '文件已发送', exact: true })).toHaveCount(0)
    expect((await files(page, id)).map((file) => file.relative_path)).toEqual(['first.txt'])
    expect(finalizeCalls).toBe(0)
    await expect(page.getByRole('button', { name: '继续编辑草稿', exact: true })).toBeVisible()
    await page.screenshot({ path: '/private/tmp/omni-transfer-upload-retry-desktop.png', fullPage: true })

    const retry = page.getByRole('button', { name: /^(重试未完成文件|正在发送…)$/ })
    await retry.click()
    await expect.poll(() => uploadAttempts).toBe(3)
    await expect(retry).toBeDisabled()
    for (const name of ['发送文件', '收集文件', '收发记录']) await expect(page.getByRole('tab', { name, exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '继续编辑草稿', exact: true })).toBeDisabled()
    expect(finalizeCalls).toBe(0)
    releaseUpload!()
    await expect(page.getByRole('heading', { name: '文件已发送', exact: true })).toBeVisible()
    expect(uploadAttempts).toBe(3)
    expect(finalizeCalls).toBe(1)
    expect((await files(page, id)).map((file) => file.relative_path).sort()).toEqual(['first.txt', 'second.txt'])
    await expectHistory(page, 'E2E 部分成功恢复', id)
  } finally {
    releaseUpload!()
    await page.unroute('**/api/v1/transfers/*/files/upload')
    await revoke(page, csrf, id)
  }
})

test('existing draft remains editable inline after reload and cannot finalize while an upload is running', async ({ page }) => {
  test.setTimeout(60_000)
  const csrf = await login(page)
  const created = await page.request.post('/api/v1/transfers', {
    headers: { 'X-CSRF-Token': csrf }, data: { title: 'E2E 历史草稿继续编辑', require_code: false },
  })
  expect(created.status()).toBe(200)
  const { send }: Created = (await created.json()).data
  let releaseUpload: (() => void) | undefined
  const heldUpload = new Promise<void>((resolve) => { releaseUpload = resolve })
  await page.route('**/api/v1/transfers/*/files/upload', async (route) => {
    await heldUpload
    await route.continue()
  })
  try {
    await page.goto(`/transfer?view=history&record=send&id=${send.id}`)
    await expect(page.getByRole('heading', { name: 'E2E 历史草稿继续编辑', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '上传文件', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '上传文件夹', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '从已有文件添加', exact: true })).toBeVisible()
    const finalize = page.getByRole('button', { name: '定稿并生成取件链接', exact: true })
    await expect(finalize).toBeDisabled()
    await page.getByTestId('transfer-record-upload-files').setInputFiles({ name: 'resumed.txt', mimeType: 'text/plain', buffer: Buffer.from('RESUMED') })
    await page.getByRole('button', { name: '上传所选文件', exact: true }).click()
    await expect(finalize).toBeDisabled()
    for (const name of ['发送文件', '收集文件', '收发记录']) await expect(page.getByRole('tab', { name, exact: true })).toBeDisabled()
    for (const name of ['返回收发记录', '刷新记录', '撤销']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
    await expect(page.getByTestId('transfer-record-upload-files')).toBeDisabled()
    await expect(page.getByTestId('transfer-record-upload-folder')).toBeDisabled()
    releaseUpload!()
    await expect(finalize).toBeEnabled()
    await page.reload()
    await expect(page.getByText('resumed.txt', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '从已有文件添加', exact: true }).click()
    const picker = page.getByRole('dialog', { name: '从已有文件添加', exact: true })
    await picker.getByRole('combobox', { name: '选择存储源', exact: true }).click()
    await page.getByRole('option', { name: '团队文件', exact: true }).click()
    await picker.getByRole('button', { name: 'projects/', exact: true }).click()
    await picker.getByRole('checkbox', { name: /roadmap\.md/ }).check()
    await picker.getByRole('button', { name: /添加所选/ }).click()
    await expect(picker).toBeHidden()
    expect((await files(page, send.id)).map((file) => file.relative_path).sort()).toEqual(['projects/roadmap.md', 'resumed.txt'])
    await finalize.click()
    await expect(page.getByRole('link', { name: '打开取件页面', exact: true })).toHaveAttribute('href', new RegExp(`/pickup/${send.public_key}$`))
    await page.reload()
    await expect(page.getByRole('link', { name: '打开取件页面', exact: true })).toBeVisible()
  } finally {
    releaseUpload!()
    await page.unroute('**/api/v1/transfers/*/files/upload')
    await revoke(page, csrf, send.id)
  }
})
