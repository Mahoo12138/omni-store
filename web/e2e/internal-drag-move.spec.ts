import { expect, test } from '@playwright/test'

test('dragging selected entries into a directory moves successes and reports conflicts', async ({ page }) => {
  const suffix = Date.now()
  const sourceA = `e2e-drag-a-${suffix}`
  const sourceB = `e2e-drag-b-${suffix}`
  const target = `e2e-drag-target-${suffix}`
  const gridTarget = `e2e-drag-grid-target-${suffix}`

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()
  await page.getByRole('combobox', { name: '每页条数' }).click()
  await page.getByRole('option', { name: '100 条/页' }).click()

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
  await createFolder(gridTarget)

  const sourceARow = page.getByRole('row', { name: new RegExp(sourceA) })
  const sourceBRow = page.getByRole('row', { name: new RegExp(sourceB) })
  const targetRow = page.getByRole('row', { name: new RegExp(target) })
  await sourceARow.getByRole('checkbox', { name: `选择 ${sourceA}` }).check()
  await sourceBRow.getByRole('checkbox', { name: `选择 ${sourceB}` }).check()
  const selectionToolbar = page.getByRole('toolbar', { name: '批量文件操作' })
  await expect(selectionToolbar).toContainText('已选择 2 项')
  await expect(sourceARow.getByRole('checkbox', { name: `选择 ${sourceA}` })).toBeChecked()
  await expect(sourceBRow.getByRole('checkbox', { name: `选择 ${sourceB}` })).toBeChecked()
  await expect(sourceARow).toHaveAttribute('draggable', 'true')
  await expect(targetRow).toHaveAttribute('draggable', 'true')
  await page.route('**/files/move', async (route) => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().path === `/${sourceA}`) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'CONFLICT', message: '测试用移动冲突' }, request_id: 'e2e' }),
      })
      return
    }
    await route.continue()
  })
  await page.evaluate(({ sourceName, targetName }) => {
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody tr'))
    const source = rows.find((row) => row.textContent?.includes(sourceName))
    const target = rows.find((row) => row.textContent?.includes(targetName))
    if (!source || !target) throw new Error('drag source or directory target is missing')
    const transfer = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    if (!transfer.getData('application/x-omnistore-file-items')) throw new Error('source row did not provide internal drag data')
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, { sourceName: sourceA, targetName: target })

  const moveStatus = page.getByRole('status', { name: '拖拽移动任务' })
  await expect(moveStatus).toContainText('1 项成功，1 项失败')
  await expect(moveStatus).toContainText(sourceA)
  await expect(sourceARow).toHaveCount(1)
  await expect(page.getByRole('row', { name: new RegExp(sourceB) })).toHaveCount(0)
  await page.screenshot({ path: '/tmp/omni-store-internal-drag-partial.png', fullPage: false })

  await targetRow.getByRole('button', { name: target, exact: true }).click()
  await expect(page.getByRole('row', { name: new RegExp(sourceA) })).toHaveCount(0)
  await expect(page.getByRole('row', { name: new RegExp(sourceB) })).toBeVisible()
  await page.unrouteAll()
  await page.locator('nav[aria-label="面包屑"]').getByText('团队文件', { exact: true }).click()

  await page.getByRole('tab', { name: '网格视图' }).click()
  await page.evaluate(({ sourceName, targetName }) => {
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('[draggable="true"]'))
    const source = tiles.find((tile) => tile.textContent?.includes(sourceName))
    const target = tiles.find((tile) => tile.textContent?.includes(targetName))
    if (!source || !target) throw new Error('grid drag source or directory target is missing')
    const transfer = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, { sourceName: sourceA, targetName: gridTarget })
  await expect(moveStatus).toContainText('已移动 1 项')
  await expect(page.getByText(sourceA, { exact: true })).toHaveCount(0)
  await page.getByText(gridTarget, { exact: true }).dblclick()
  await expect(page.getByText(sourceA, { exact: true })).toBeVisible()
  await page.locator('nav[aria-label="面包屑"]').getByText('团队文件', { exact: true }).click()

  const selfTargetRow = page.locator('[draggable="true"]').filter({ hasText: gridTarget })
  const moveRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/files/move') && request.method() === 'POST') moveRequests.push(request.postData() ?? '')
  })
  const moveRequestCount = moveRequests.length
  await selfTargetRow.evaluate((tile) => {
    const transfer = new DataTransfer()
    tile.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    tile.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    tile.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  await expect(page.getByRole('alert')).toContainText('不能将')
  expect(moveRequests).toHaveLength(moveRequestCount)
  await page.getByRole('tab', { name: '列表视图' }).click()

  for (const name of [target, gridTarget]) {
    const row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: `更多操作 ${name}` }).click()
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    await page.getByRole('dialog', { name: '移入回收站' }).getByRole('button', { name: '移入回收站' }).click()
  }

  const trashResponse = page.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/trash'))
  await page.getByRole('button', { name: '回收站' }).click()
  await trashResponse
  const dragArtifactRows = page.locator('tbody tr').filter({ hasText: 'e2e-drag-' })
  while (await dragArtifactRows.count() > 0) {
    const row = dragArtifactRows.first()
    const name = (await row.locator('td').first().innerText()).trim()
    await row.getByRole('button', { name: '永久删除' }).click()
    const responsePromise = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().includes('/trash/'))
    await page.getByRole('dialog', { name: '永久删除' }).getByRole('button', { name: '永久删除', exact: true }).click()
    expect((await responsePromise).ok()).toBe(true)
    await expect(page.getByText(name, { exact: true })).toHaveCount(0)
  }
})
