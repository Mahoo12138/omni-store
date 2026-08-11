import { expect, test, type Page } from '@playwright/test'

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
}

async function expectLocalHorizontalScroll(page: Page, regionName: string) {
  const region = page.getByRole('region', { name: regionName, exact: true })
  await expect(region).toBeVisible()

  const metrics = await region.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }))
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth)
  expect(metrics.overflowX).toBe('auto')

  await region.evaluate((element) => { element.scrollLeft = 0 })
  await region.hover()
  await page.mouse.wheel(480, 0)
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)

  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  ))).toBe(false)
}

test('storage source settings stay clear and usable on desktop and mobile', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/app/admin?section=sources')

  await expect(page.getByRole('heading', { name: '存储源', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '新建存储源', exact: true })).toBeVisible()
  await expect(page.getByRole('listitem', { name: '存储源 公开演示资料' })).toBeVisible()
  await expect(page.getByRole('listitem', { name: '存储源 团队文件' })).toBeVisible()

  await page.getByRole('button', { name: '配置存储源 团队文件' }).click()
  const settingsDialog = page.getByRole('dialog', { name: '配置：团队文件' })
  await expect(settingsDialog).toBeVisible()
  await expect(settingsDialog.getByRole('button', { name: '保存配额' })).toHaveCount(0)
  await expect(settingsDialog.getByRole('button', { name: '保存路径' })).toHaveCount(0)
  await expect(settingsDialog.getByRole('button', { name: '保存排除规则' })).toHaveCount(0)

  const quotaInput = settingsDialog.getByLabel('存储源配额 GiB')
  const patternsInput = settingsDialog.locator('textarea')
  const originalQuota = await quotaInput.inputValue()
  const originalPatterns = await patternsInput.inputValue()
  const changedQuota = String(Number(originalQuota) + 0.001)
  const changedPatterns = `${originalPatterns}\n**/*.omnistore-e2e`
  const saveSettings = settingsDialog.getByRole('button', { name: '保存设置' })
  await expect(saveSettings).toBeDisabled()

  await quotaInput.fill(changedQuota)
  await patternsInput.fill(changedPatterns)
  await expect(saveSettings).toBeEnabled()
  await saveSettings.click()
  await expect(settingsDialog).toBeHidden()

  await page.getByRole('button', { name: '配置存储源 团队文件' }).click()
  await expect(settingsDialog).toBeVisible()
  await expect(quotaInput).toHaveValue(changedQuota)
  await expect(patternsInput).toHaveValue(changedPatterns)

  await quotaInput.fill(originalQuota)
  await patternsInput.fill(originalPatterns)
  await settingsDialog.getByRole('button', { name: '保存设置' }).click()
  await expect(settingsDialog).toBeHidden()

  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.getByRole('button', { name: '新建存储源', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '配置存储源 公开演示资料' })).toBeVisible()
  await expect(page.getByRole('button', { name: '禁用存储源 公开演示资料' })).toBeVisible()
  await expect(page.getByRole('button', { name: '删除存储源 公开演示资料' })).toBeVisible()
  const hasHorizontalOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  ))
  expect(hasHorizontalOverflow).toBe(false)

  await page.getByRole('button', { name: '新建存储源', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '新建存储源' })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
})

test('primary settings actions belong to their module headers', async ({ page }) => {
  await loginAsAdmin(page)

  const modules = [
    {
      section: 'sources',
      heading: '存储源',
      action: '新建存储源',
      dialog: '新建存储源',
    },
    {
      section: 'policies',
      heading: '访问策略',
      action: '新建策略',
      dialog: '新建访问策略',
    },
    {
      section: 'users',
      heading: '用户',
      action: '创建用户',
      dialog: '创建用户',
    },
  ] as const

  for (const module of modules) {
    await page.goto(`/app/admin?section=${module.section}`)
    const moduleHeader = page.locator('header').filter({
      has: page.getByRole('heading', { name: module.heading, exact: true }),
    })
    const action = moduleHeader.getByRole('button', { name: module.action, exact: true })
    await expect(moduleHeader).toBeVisible()
    await expect(action).toBeVisible()
    await action.click()
    await expect(page.getByRole('dialog', { name: module.dialog })).toBeVisible()
    await page.getByRole('button', { name: '取消', exact: true }).click()
  }

  await page.goto('/app/admin?section=image-bed')
  const imageBedHeader = page.locator('header').filter({
    has: page.getByRole('heading', { name: '匿名公共图床', exact: true }),
  })
  const imageBedAction = imageBedHeader.getByRole('button', { name: /开启|调整/ })
  await expect(imageBedAction).toBeVisible()
  await imageBedAction.click()
  await expect(page.getByRole('dialog', { name: /匿名图床/ })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()

  await page.setViewportSize({ width: 375, height: 812 })
  for (const module of modules) {
    await page.goto(`/app/admin?section=${module.section}`)
    const action = page.locator('header').filter({
      has: page.getByRole('heading', { name: module.heading, exact: true }),
    }).getByRole('button', { name: module.action, exact: true })
    await expect(action).toBeVisible()
    const hasHorizontalOverflow = await page.evaluate(() => (
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    ))
    expect(hasHorizontalOverflow).toBe(false)
  }
})

test('credential overview opens one isolated management modal at a time', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await loginAsAdmin(page)
  await page.setViewportSize({ width: 1119, height: 880 })
  await page.goto('/app/admin?section=profile')

  const connectionTypes = page.getByRole('navigation', { name: '连接类型' })
  const webdavEntry = connectionTypes.getByRole('button', { name: '管理 WebDAV' })
  const imageApiEntry = connectionTypes.getByRole('button', { name: '管理 图床 API' })
  const s3Entry = connectionTypes.getByRole('button', { name: '管理 S3' })

  await expect(webdavEntry).toBeVisible()
  await expect(imageApiEntry).toBeVisible()
  await expect(s3Entry).toBeVisible()
  await expect(page.getByRole('region', { name: 'WebDAV', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '图床 API', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'S3 Access Key', exact: true })).toHaveCount(0)

  await webdavEntry.click()
  const webdavDialog = page.getByRole('dialog', { name: 'WebDAV', exact: true })
  const webdav = webdavDialog.getByRole('region', { name: 'WebDAV', exact: true })
  await expect(webdavDialog).toBeVisible()
  await expect(webdav).toContainText('挂载路径')
  await expect(webdav).toContainText('/dav')
  await webdav.getByRole('button', { name: '重置 Token', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '重置 WebDAV' })).toBeVisible()
  await page.getByRole('dialog', { name: '重置 WebDAV' }).getByRole('button', { name: '取消', exact: true }).click()
  await expect(webdavDialog).toBeVisible()
  await webdavDialog.getByRole('button', { name: '完成', exact: true }).click()

  await expect(webdavEntry).toBeFocused()
  await imageApiEntry.click()
  await expect(webdav).toHaveCount(0)
  const imageApiDialog = page.getByRole('dialog', { name: '图床 API', exact: true })
  const imageApi = imageApiDialog.getByRole('region', { name: '图床 API', exact: true })
  await expect(imageApiDialog).toBeVisible()
  await imageApi.getByRole('button', { name: '新建 Token', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '新建图床 Token' })).toBeVisible()
  const visibleBackdropCount = await page.locator('body *').evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element)
    return style.position === 'fixed'
      && style.inset === '0px'
      && style.backgroundColor !== 'rgba(0, 0, 0, 0)'
      && style.backgroundColor !== 'transparent'
  }).length)
  expect(visibleBackdropCount).toBe(2)
  await page.getByRole('dialog', { name: '新建图床 Token' }).getByRole('button', { name: '取消', exact: true }).click()
  await imageApiDialog.getByRole('button', { name: '完成', exact: true }).click()

  await s3Entry.click()
  const s3Dialog = page.getByRole('dialog', { name: 'S3', exact: true })
  const s3 = s3Dialog.getByRole('region', { name: 'S3 Access Key', exact: true })
  await expect(s3Dialog).toBeVisible()
  await expect(s3.getByRole('list', { name: 'S3 凭据列表' })).toBeVisible()
  await expect(s3.getByRole('list', { name: 'S3 Bucket 映射' })).toBeVisible()
  const copyBucket = s3.getByRole('button', { name: '复制 Bucket' }).first()
  await copyBucket.click()
  await expect(s3.getByRole('button', { name: '已复制' })).toBeVisible()
  await s3.getByRole('button', { name: '新建凭据', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '新建 S3 凭据' })).toBeVisible()
  await page.getByRole('dialog', { name: '新建 S3 凭据' }).getByRole('button', { name: '取消', exact: true }).click()
  await s3Dialog.getByRole('button', { name: '完成', exact: true }).click()
  await expect(s3Entry).toBeFocused()

  await page.setViewportSize({ width: 375, height: 812 })
  await webdavEntry.click()
  const mobileWebdavDialog = page.getByRole('dialog', { name: 'WebDAV', exact: true })
  await expect(mobileWebdavDialog.getByRole('region', { name: 'WebDAV', exact: true })).toBeVisible()
  await mobileWebdavDialog.getByRole('button', { name: '完成', exact: true }).click()
  await imageApiEntry.click()
  const mobileImageDialog = page.getByRole('dialog', { name: '图床 API', exact: true })
  await expect(mobileImageDialog.getByRole('region', { name: '图床 API', exact: true })).toBeVisible()
  await mobileImageDialog.getByRole('button', { name: '完成', exact: true }).click()
  await s3Entry.click()
  const mobileS3Dialog = page.getByRole('dialog', { name: 'S3', exact: true })
  await expect(mobileS3Dialog.getByRole('region', { name: 'S3 Access Key', exact: true })).toBeVisible()
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  ))).toBe(false)
  await mobileS3Dialog.getByRole('button', { name: '完成', exact: true }).click()
})

test('admin data regions scroll locally without squeezing narrow layouts', async ({ page }) => {
  await loginAsAdmin(page)
  await page.setViewportSize({ width: 893, height: 880 })

  const dataRegions = [
    { section: 'stats', name: '存储源概览' },
    { section: 'sources', name: '存储源' },
    { section: 'policies', name: '访问策略' },
    { section: 'users', name: '用户' },
    { section: 'audit', name: '审计日志' },
  ] as const

  for (const dataRegion of dataRegions) {
    await page.goto(`/app/admin?section=${dataRegion.section}`)
    await expectLocalHorizontalScroll(page, dataRegion.name)
  }

  await page.setViewportSize({ width: 375, height: 812 })
  for (const dataRegion of dataRegions) {
    await page.goto(`/app/admin?section=${dataRegion.section}`)
    await expectLocalHorizontalScroll(page, dataRegion.name)
  }
})

test('every admin section remains readable and keeps its active navigation visible', async ({ page }) => {
  await loginAsAdmin(page)

  const sections = [
    { key: 'profile', nav: '我的', heading: '测试管理员' },
    { key: 'preferences', nav: '偏好设置', heading: '偏好设置' },
    { key: 'stats', nav: '仪表盘', heading: '系统状态' },
    { key: 'sources', nav: '存储源', heading: '存储源' },
    { key: 'policies', nav: '访问策略', heading: '访问策略' },
    { key: 'users', nav: '用户', heading: '用户' },
    { key: 'audit', nav: '审计日志', heading: '审计日志' },
    { key: 'backup', nav: '配置导出', heading: '导出系统配置包' },
    { key: 'image-bed', nav: '匿名图床', heading: '匿名公共图床' },
  ] as const

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 916, height: 880 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport)

    for (const section of sections) {
      await page.goto(`/app/admin?section=${section.key}`)

      const settingsNav = page.getByRole('navigation', { name: '设置分组' })
      const activeItem = settingsNav.getByRole('button', { name: section.nav, exact: true })
      await expect(activeItem).toHaveAttribute('aria-current', 'page')
      await expect(activeItem).toBeInViewport()
      await expect(page.getByRole('heading', { name: section.heading, exact: true })).toBeVisible()

      expect(await page.evaluate(() => (
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      ))).toBe(false)

      const clippedOutsideScrollRegions = await page.locator('main').evaluate((main) => (
        [...main.querySelectorAll<HTMLElement>('*')].filter((element) => {
          const box = element.getBoundingClientRect()
          if (box.width <= 0 || box.height <= 0) return false

          let ancestor: HTMLElement | null = element.parentElement
          while (ancestor && ancestor !== main) {
            const overflowX = getComputedStyle(ancestor).overflowX
            if (overflowX === 'auto' || overflowX === 'scroll') return false
            ancestor = ancestor.parentElement
          }

          return box.left < -1 || box.right > innerWidth + 1
        }).map((element) => element.textContent?.trim().slice(0, 80) ?? element.tagName)
      ))
      expect(clippedOutsideScrollRegions).toEqual([])
    }
  }

  await page.goto('/app/admin?section=profile')
  const accountName = page.getByRole('heading', { name: '测试管理员', exact: true })
  const accountNameBox = await accountName.boundingBox()
  expect(accountNameBox?.height ?? Infinity).toBeLessThan(48)

  await page.getByRole('button', { name: '修改显示名', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '修改显示名' })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()

  await page.goto('/app/admin?section=image-bed')
  await page.getByRole('button', { name: /开启|调整/ }).click()
  await expect(page.getByRole('dialog', { name: /匿名图床/ })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
})
