import { expect, test } from '@playwright/test'

test('batch sharing applies common settings, preserves partial success, and retries only failures', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const suffix = Date.now()
  const names = [
    `e2e-batch-share-a-${suffix}`,
    `e2e-batch-share-b-${suffix}`,
    `e2e-batch-share-c-${suffix}`,
  ]

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()
  await expect(page).toHaveTitle(/OmniStore/)
  await expect(page.getByRole('heading', { name: '团队文件' })).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)

  for (const name of names) {
    await page.getByRole('button', { name: '创建文件夹' }).click()
    const dialog = page.getByRole('dialog', { name: '新建文件夹' })
    await dialog.getByLabel('目录名').fill(name)
    await dialog.getByRole('button', { name: '创建', exact: true }).click()
    await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible()
  }

  for (const name of names) {
    await page.getByRole('row', { name: new RegExp(name) }).getByRole('checkbox', { name: `选择 ${name}` }).check()
  }
  const toolbar = page.getByRole('toolbar', { name: '批量文件操作' })
  await expect(toolbar).toContainText('已选择 3 项')
  await toolbar.getByRole('button', { name: '创建分享' }).click()

  const dialog = page.getByRole('dialog', { name: '批量创建分享' })
  await dialog.getByLabel('访问密码').fill('batch-pass')
  await dialog.getByRole('combobox', { name: '分享有效期' }).click()
  await page.getByRole('option', { name: '7 天' }).click()
  await dialog.getByLabel('下载次数上限').fill('3')

  const requests: Array<{ path: string; password: string; expires_at: string | null; max_downloads: number }> = []
  await page.route('**/api/v1/shares', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const body = route.request().postDataJSON()
    requests.push(body)
    if (body.path === `/${names[1]}`) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'CONFLICT', message: '测试用冲突' }, request_id: 'e2e-batch-share' }),
      })
      return
    }
    await route.continue()
  })
  await dialog.getByRole('button', { name: '创建 3 个分享' }).click()
  await expect(dialog.getByRole('status')).toContainText('完成：2 个成功，1 个失败')
  await expect(dialog.getByRole('list', { name: '已创建的分享链接' }).getByRole('listitem')).toHaveCount(2)
  await expect(dialog.getByRole('list', { name: '创建失败的项目' })).toContainText(names[1])
  expect(requests).toHaveLength(3)
  for (const request of requests) {
    expect(request.password).toBe('batch-pass')
    expect(request.expires_at).toBeTruthy()
    expect(request.max_downloads).toBe(3)
  }

  await page.unroute('**/api/v1/shares')
  const retriedPaths: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/shares') && request.method() === 'POST') {
      retriedPaths.push(request.postDataJSON().path)
    }
  })
  await dialog.getByRole('button', { name: '重试失败项（1）' }).click()
  await expect(dialog.getByRole('status')).toContainText('完成：3 个成功，0 个失败')
  expect(retriedPaths).toEqual([`/${names[1]}`])
  await expect(dialog.getByRole('list', { name: '已创建的分享链接' }).getByRole('listitem')).toHaveCount(3)
  await page.screenshot({ path: '/tmp/omni-store-batch-share.png' })
  await dialog.getByRole('button', { name: '完成' }).click()

  const cleanup = await page.evaluate(async (folderNames) => {
    const csrf = (await fetch('/api/v1/auth/me').then((response) => response.json())).data.csrf_token as string
    const headers = { 'X-CSRF-Token': csrf }
    const sources = (await fetch('/api/v1/sources').then((response) => response.json())).data.items as Array<{ key: string; name: string }>
    const source = sources.find((item) => item.name === '团队文件')
    if (!source) throw new Error('测试存储源不存在，无法清理分享测试数据')
    const shares = (await fetch('/api/v1/shares').then((response) => response.json())).data.items as Array<{ key: string; name: string }>
    let revoked = 0
    for (const share of shares.filter((item) => folderNames.includes(item.name))) {
      const response = await fetch(`/api/v1/shares/${encodeURIComponent(share.key)}`, { method: 'DELETE', headers })
      if (!response.ok) throw new Error(`清理分享失败：${share.name}`)
      revoked += 1
    }
    let trashed = 0
    for (const name of folderNames) {
      const response = await fetch(`/api/v1/sources/${encodeURIComponent(source.key)}/files?path=${encodeURIComponent(`/${name}`)}`, { method: 'DELETE', headers })
      if (!response.ok) throw new Error(`清理测试文件夹失败：${name}`)
      const entry = (await response.json()).data as { key: string }
      const purged = await fetch(`/api/v1/sources/${encodeURIComponent(source.key)}/trash/${encodeURIComponent(entry.key)}`, { method: 'DELETE', headers })
      if (!purged.ok) throw new Error(`永久清理测试文件夹失败：${name}`)
      trashed += 1
    }
    return { revoked, trashed }
  }, names)
  expect(cleanup).toEqual({ revoked: 3, trashed: 3 })
  expect(pageErrors).toEqual([])
})
