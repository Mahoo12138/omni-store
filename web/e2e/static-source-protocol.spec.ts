import { expect, test } from '@playwright/test'

// 与普通文件上传组合验证；两个源使用同一文件名和不同内容。
for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
  test(`static HTTP is configured per source at ${viewport.width}px`, async ({ page, request }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto('/login')
    await page.getByLabel('用户名').fill('admin')
    await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page).toHaveURL(/\/app$/)
    const me = await (await page.request.get('/api/v1/auth/me')).json()
    const headers = { 'X-CSRF-Token': me.data.csrf_token }
    const sourcesResponse = await page.request.get('/api/v1/admin/sources')
    const sources: Array<{ key: string; name: string }> = (await sourcesResponse.json()).data.items
    const selected = sources.filter((source) => ['公开演示资料', '团队文件'].includes(source.name))
    expect(selected).toHaveLength(2)
    const filename = `static-${Date.now()} 空格%#.png`
    const published: Array<{ key: string; url: string; id: string; bytes: Buffer }> = []
    try {
      await page.goto('/app/admin?section=sources')
      for (const source of selected) {
        const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from(source.name)])
        const upload = await page.request.post(`/api/v1/sources/${source.key}/upload?path=`, {
          headers, multipart: { file: { name: filename, mimeType: 'image/png', buffer: bytes } },
        })
        expect(upload.status()).toBe(200)
        await page.getByRole('button', { name: `配置存储源 ${source.name}` }).click()
        const dialog = page.getByRole('dialog', { name: `配置：${source.name}`, exact: true })
        await expect(dialog).toContainText(source.name)
        const webdav = dialog.getByRole('checkbox', { name: '启用 WebDAV', exact: true })
        const originalWebdav = await webdav.isChecked()
        await webdav.setChecked(!originalWebdav)
        await dialog.getByRole('button', { name: '配置静态 HTTP', exact: true }).click()
        await dialog.getByLabel('静态资源发布目录').fill('')
        await dialog.getByRole('button', { name: '收起静态 HTTP', exact: true }).click()
        await dialog.getByRole('tab', { name: '存储设置', exact: true }).click()
        await dialog.getByRole('tab', { name: '访问协议', exact: true }).click()
        await dialog.getByRole('button', { name: '配置静态 HTTP', exact: true }).click()
        await expect(dialog.getByLabel('静态资源发布目录')).toHaveValue('')
        await dialog.getByRole('button', { name: '预检发布目录' }).click()
        await expect(dialog.getByText(/样例条目：/)).toBeVisible()
        const create = dialog.getByRole('button', { name: '创建发布空间' })
        await expect(create).toBeDisabled()
        await dialog.getByRole('checkbox', { name: '我确认公开此存储源根目录内的受支持媒体文件' }).check()
        await create.click()
        await expect(dialog).toContainText('公开读取中')
        await expect(webdav).toBeChecked({ checked: !originalWebdav })
        const sourceDetail = (await (await page.request.get(`/api/v1/admin/sources/${source.key}`)).json()).data
        expect(sourceDetail.source.webdav_enabled).toBe(originalWebdav)
        const config = (await (await page.request.get(`/api/v1/admin/sources/${source.key}/static-access/config`)).json()).data
        await expect(dialog).toContainText(config.base_url)
        await dialog.getByRole('button', { name: '复制', exact: true }).scrollIntoViewIfNeeded()
        await expect(dialog.getByRole('button', { name: '复制', exact: true })).toBeInViewport()
        published.push({ key: source.key, id: config.public_asset_id, url: `${config.base_url}${encodeURIComponent(filename)}`, bytes })
        await dialog.getByRole('button', { name: '关闭弹窗' }).click()
      }
      expect(published[0].id).not.toBe(published[1].id)
      for (const publication of published) {
        const response = await request.get(publication.url)
        expect(response.status()).toBe(200)
        expect(await response.body()).toEqual(publication.bytes)
      }
      const first = selected[0]
      await page.getByRole('button', { name: `配置存储源 ${first.name}` }).click()
      const dialog = page.getByRole('dialog', { name: `配置：${first.name}`, exact: true })
      await dialog.getByRole('button', { name: '配置静态 HTTP', exact: true }).click()
      await dialog.getByRole('checkbox', { name: '提供公开读取' }).uncheck()
      await dialog.getByRole('button', { name: '保存静态 HTTP', exact: true }).click()
      await expect(dialog).toContainText('已关闭（原站 404）')
      expect((await request.get(published[0].url)).status()).toBe(404)
      expect((await request.get(published[1].url)).status()).toBe(200)
      await dialog.getByRole('checkbox', { name: '提供公开读取' }).check()
      await dialog.getByRole('button', { name: '保存静态 HTTP', exact: true }).click()
      await expect(dialog).toContainText('公开读取中')
      expect((await request.get(published[0].url)).status()).toBe(200)
      await expect(dialog).toContainText(published[0].id)
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      expect(errors).toEqual([])
      await dialog.getByRole('button', { name: '更换发布空间' }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `/tmp/omni-static-${viewport.width}.png`, fullPage: false })
    } finally {
      // 每个测试只撤销自己创建的公开配置，普通文件清理走既有回收站流程。
      for (const publication of published) {
        const path = `/api/v1/admin/sources/${publication.key}/static-access/config`
        const disabled = await page.request.put(path, { headers, data: { enabled: false } })
        const config = (await disabled.json()).data
        expect((await page.request.delete(path, { headers, data: { expected_revision: config.revision } })).status()).toBe(200)
        expect((await page.request.delete(`/api/v1/sources/${publication.key}/files?path=${encodeURIComponent(filename)}`, { headers })).status()).toBe(200)
      }
    }
  })
}
