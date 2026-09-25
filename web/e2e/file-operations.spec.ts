import { expect, test } from '@playwright/test'

test('directory can be created, renamed, copied, cut-pasted and cleaned up', async ({ page }) => {
  const suffix = Date.now()
  const originalName = `e2e-ops-${suffix}`
  const renamedName = `${originalName}-renamed`
  const pasteDestinationName = `${originalName}-paste-target`
  const moveDestinationName = `${originalName}-move-target`

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()

  await page.getByRole('button', { name: '上传目录' }).click()
  const directoryDialog = page.getByRole('dialog', { name: '上传目录', exact: true })
  await expect(directoryDialog).toBeVisible()
  await expect(directoryDialog).toContainText('保留子目录结构')
  await directoryDialog.getByRole('button', { name: '取消', exact: true }).click()

  await page.getByRole('button', { name: '创建文件夹' }).click()
  const createDialog = page.getByRole('dialog', { name: '新建文件夹' })
  await createDialog.getByLabel('目录名').fill(originalName)
  await createDialog.getByRole('button', { name: '创建', exact: true }).click()
  let row = page.getByRole('row', { name: new RegExp(originalName) })
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: `更多操作 ${originalName}` }).click()
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  const renameDialog = page.getByRole('dialog', { name: '重命名' })
  await renameDialog.getByLabel('新名称').fill(renamedName)
  await renameDialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('row', { name: new RegExp(renamedName) })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(`${originalName}$`) })).toHaveCount(0)

  for (const name of [pasteDestinationName, moveDestinationName]) {
    await page.getByRole('button', { name: '创建文件夹' }).click()
    const createDialog = page.getByRole('dialog', { name: '新建文件夹' })
    await createDialog.getByLabel('目录名').fill(name)
    await createDialog.getByRole('button', { name: '创建', exact: true }).click()
    await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible()
  }

  row = page.getByRole('row', { name: new RegExp(renamedName) })
  await row.getByRole('button', { name: '复制' }).click()
  const clipboard = page.getByRole('region', { name: '文件剪贴板' })
  await expect(clipboard).toContainText('已复制 1 项')
  const pasteButton = clipboard.getByRole('button', { name: '粘贴到此处' })
  await expect(pasteButton).toBeDisabled()
  await pasteButton.locator('..').hover()
  await expect(page.getByRole('tooltip')).toContainText(`目标目录与“${renamedName}”的来源目录相同`)

  await page.getByRole('row', { name: new RegExp(pasteDestinationName) }).getByRole('button', { name: pasteDestinationName, exact: true }).click()
  await clipboard.getByRole('button', { name: '粘贴到此处' }).click()
  await expect(page.getByRole('status', { name: '粘贴任务' })).toContainText('已粘贴 1 项')
  await expect(page.getByRole('row', { name: new RegExp(renamedName) })).toBeVisible()

  row = page.getByRole('row', { name: new RegExp(renamedName) })
  await row.getByRole('button', { name: `更多操作 ${renamedName}` }).click()
  await page.getByRole('menuitem', { name: '剪切', exact: true }).click()
  await expect(page.getByRole('region', { name: '文件剪贴板' })).toContainText('已剪切 1 项')
  await page.locator('nav[aria-label="面包屑"]').getByText('团队文件', { exact: true }).click()
  await page.getByRole('row', { name: new RegExp(moveDestinationName) }).getByRole('button', { name: moveDestinationName, exact: true }).click()
  await page.getByRole('region', { name: '文件剪贴板' }).getByRole('button', { name: '粘贴到此处' }).click()
  await expect(page.getByRole('status', { name: '粘贴任务' })).toContainText('已粘贴 1 项')
  await expect(page.getByRole('row', { name: new RegExp(renamedName) })).toBeVisible()

  await page.locator('nav[aria-label="面包屑"]').getByText('团队文件', { exact: true }).click()

  for (const name of [renamedName, pasteDestinationName, moveDestinationName]) {
    row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: `更多操作 ${name}` }).click()
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    await page.getByRole('dialog', { name: '移入回收站' }).getByRole('button', { name: '移入回收站' }).click()
    await expect(row).toHaveCount(0)
  }

  await page.getByRole('button', { name: '回收站' }).click()
  for (const name of [renamedName, pasteDestinationName, moveDestinationName]) {
    row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: '永久删除' }).click()
    await page.getByRole('dialog', { name: '永久删除' }).getByRole('button', { name: '永久删除' }).click()
    await expect(row).toHaveCount(0)
  }
})

test('multi-select paste reports partial conflicts and keeps only failed copies for retry', async ({ page }) => {
  const suffix = Date.now()
  const sourceA = `e2e-partial-a-${suffix}`
  const sourceB = `e2e-partial-b-${suffix}`
  const target = `e2e-partial-target-${suffix}`

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()

  async function createFolder(name: string) {
    await page.getByRole('button', { name: '创建文件夹' }).click()
    const dialog = page.getByRole('dialog', { name: '新建文件夹' })
    await dialog.getByLabel('目录名').fill(name)
    await dialog.getByRole('button', { name: '创建', exact: true }).click()
    await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible()
  }

  await createFolder(sourceA)
  await createFolder(sourceB)
  await createFolder(target)
  await page.getByRole('row', { name: new RegExp(target) }).getByRole('button', { name: target, exact: true }).click()
  await createFolder(sourceA)
  await page.locator('nav[aria-label="面包屑"]').getByText('团队文件', { exact: true }).click()

  await page.getByRole('row', { name: new RegExp(sourceA) }).getByRole('checkbox', { name: `选择 ${sourceA}` }).check()
  await page.getByRole('row', { name: new RegExp(sourceB) }).getByRole('checkbox', { name: `选择 ${sourceB}` }).check()
  const selectionToolbar = page.getByRole('toolbar', { name: '批量文件操作' })
  await expect(selectionToolbar).toContainText('已选择 2 项')
  await selectionToolbar.getByRole('button', { name: '复制', exact: true }).click()

  const clipboard = page.getByRole('region', { name: '文件剪贴板' })
  await expect(clipboard).toContainText('已复制 2 项')
  await page.getByRole('row', { name: new RegExp(target) }).getByRole('button', { name: target, exact: true }).click()
  await clipboard.getByRole('button', { name: '粘贴到此处' }).click()

  const pasteStatus = page.getByRole('status', { name: '粘贴任务' })
  await expect(pasteStatus).toContainText('1 项成功，1 项失败')
  await expect(page.getByRole('row', { name: new RegExp(sourceB) })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(sourceA) })).toBeVisible()
  await expect(clipboard).toContainText('已复制 1 项')
  await page.screenshot({ path: '/tmp/omni-store-partial-copy-paste.png', fullPage: false })

  const conflictRow = page.getByRole('row', { name: new RegExp(sourceA) })
  await conflictRow.getByRole('button', { name: `更多操作 ${sourceA}` }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await page.getByRole('dialog', { name: '移入回收站' }).getByRole('button', { name: '移入回收站' }).click()
  await expect(conflictRow).toHaveCount(0)

  await clipboard.getByRole('button', { name: '粘贴到此处' }).click()
  await expect(pasteStatus).toContainText(`已粘贴 1 项到 /${target}`)
  await expect(page.getByRole('row', { name: new RegExp(sourceA) })).toBeVisible()
  await clipboard.getByRole('button', { name: '清空剪贴板' }).click()

  await page.locator('nav[aria-label="面包屑"]').getByText('团队文件', { exact: true }).click()
  for (const name of [sourceA, sourceB, target]) {
    const row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: `更多操作 ${name}` }).click()
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    await page.getByRole('dialog', { name: '移入回收站' }).getByRole('button', { name: '移入回收站' }).click()
    await expect(row).toHaveCount(0)
  }

  await page.getByRole('button', { name: '回收站' }).click()
  for (const name of [sourceA, sourceB, target]) {
    const rows = page.getByRole('row').filter({ has: page.getByText(name, { exact: true }) })
    while (await rows.count() > 0) {
      const count = await rows.count()
      const row = rows.first()
      await row.getByRole('button', { name: '永久删除' }).click()
      await page.getByRole('dialog', { name: '永久删除' }).getByRole('button', { name: '永久删除', exact: true }).click()
      await expect(rows).toHaveCount(count - 1)
    }
  }
})

test('batch delete confirms selection and keeps failed entries selected for retry', async ({ page }) => {
  const suffix = Date.now()
  const first = `e2e-batch-delete-a-${suffix}`
  const second = `e2e-batch-delete-b-${suffix}`
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource: the server responded with a status of 500')) {
      browserErrors.push(message.text())
    }
  })

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()
  await expect(page).toHaveTitle('OmniStore')
  await expect(page).toHaveURL(/\/app\/sources\/[^/]+/)
  await expect(page.getByRole('heading', { name: '团队文件' })).toBeVisible()

  async function createFolder(name: string) {
    await page.getByRole('button', { name: '创建文件夹' }).click()
    const dialog = page.getByRole('dialog', { name: '新建文件夹' })
    await dialog.getByLabel('目录名').fill(name)
    await dialog.getByRole('button', { name: '创建', exact: true }).click()
    await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible()
  }

  await createFolder(first)
  await createFolder(second)
  await page.getByRole('row', { name: new RegExp(first) }).getByRole('checkbox', { name: `选择 ${first}` }).check()
  await page.getByRole('row', { name: new RegExp(second) }).getByRole('checkbox', { name: `选择 ${second}` }).check()

  const selectionToolbar = page.getByRole('toolbar', { name: '批量文件操作' })
  await selectionToolbar.getByRole('button', { name: '移入回收站' }).click()
  const confirmation = page.getByRole('dialog', { name: '将 2 项移入回收站？' })
  await expect(confirmation).toContainText(first)
  await expect(confirmation).toContainText(second)
  await confirmation.getByRole('button', { name: '取消' }).click()
  await expect(selectionToolbar).toContainText('已选择 2 项')

  await page.route('**/api/v1/sources/**/files?*', async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())
    if (request.method() === 'DELETE' && requestUrl.searchParams.get('path') === `/${second}`) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '测试用删除失败' }, request_id: 'e2e' }),
      })
      return
    }
    await route.continue()
  })

  await selectionToolbar.getByRole('button', { name: '移入回收站' }).click()
  await confirmation.getByRole('button', { name: '移入回收站' }).click()
  const deleteStatus = page.getByRole('status', { name: '批量删除任务' })
  await expect(deleteStatus).toContainText('1 项成功，1 项失败')
  await expect(deleteStatus).toBeInViewport({ ratio: 0.9 })
  await expect(page.getByRole('row', { name: new RegExp(first) })).toHaveCount(0)
  await expect(page.getByRole('row', { name: new RegExp(second) }).getByRole('checkbox', { name: `选择 ${second}` })).toBeChecked()
  await page.screenshot({ path: '/tmp/omni-store-batch-delete-partial.png', fullPage: false })

  await page.unrouteAll()
  await expect(selectionToolbar).toContainText('已选择 1 项')
  await selectionToolbar.getByRole('button', { name: '移入回收站' }).click()
  await page.getByRole('dialog', { name: '将 1 项移入回收站？' }).getByRole('button', { name: '移入回收站' }).click()
  await expect(deleteStatus).toContainText('已处理 1 项')
  await expect(page.getByRole('row', { name: new RegExp(second) })).toHaveCount(0)

  await page.getByRole('button', { name: '回收站' }).click()
  for (const name of [first, second]) {
    const row = page.getByRole('row').filter({ has: page.getByText(name, { exact: true }) })
    await row.getByRole('button', { name: '永久删除' }).click()
    await page.getByRole('dialog', { name: '永久删除' }).getByRole('button', { name: '永久删除', exact: true }).click()
    await expect(row).toHaveCount(0)
  }
  expect(browserErrors).toEqual([])
})
