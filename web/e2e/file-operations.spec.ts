import { expect, test } from '@playwright/test'

test('directory can be created, renamed, copied, moved and cleaned up', async ({ page }) => {
  const suffix = Date.now()
  const originalName = `e2e-ops-${suffix}`
  const renamedName = `${originalName}-renamed`
  const copiedName = `${originalName}-copy`
  const movedName = `${originalName}-moved`

  await page.goto('/login')
  await page.getByLabel('用户名').fill('demo')
  await page.getByLabel('密码').fill('OmniStore-Test-Demo!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '打开存储源 团队文件' }).click()

  await page.getByRole('button', { name: '创建文件夹' }).click()
  const createDialog = page.getByRole('dialog', { name: '新建文件夹' })
  await createDialog.getByLabel('目录名').fill(originalName)
  await createDialog.getByRole('button', { name: '创建', exact: true }).click()
  let row = page.getByRole('row', { name: new RegExp(originalName) })
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: '重命名' }).click()
  const renameDialog = page.getByRole('dialog', { name: '重命名' })
  await renameDialog.getByLabel('新名称').fill(renamedName)
  await renameDialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('row', { name: new RegExp(renamedName) })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(`${originalName}$`) })).toHaveCount(0)

  row = page.getByRole('row', { name: new RegExp(renamedName) })
  await row.getByRole('button', { name: '复制' }).click()
  const copyDialog = page.getByRole('dialog', { name: '复制' })
  await copyDialog.getByLabel('目标路径').fill(`/${copiedName}`)
  await copyDialog.getByRole('button', { name: '复制', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('复制完成')
  await expect(page.getByRole('row', { name: new RegExp(copiedName) })).toBeVisible()

  row = page.getByRole('row', { name: new RegExp(copiedName) })
  await row.getByRole('button', { name: '移动' }).click()
  const moveDialog = page.getByRole('dialog', { name: '移动' })
  await moveDialog.getByLabel('目标路径').fill(`/${movedName}`)
  await moveDialog.getByRole('button', { name: '移动', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('移动完成')
  await expect(page.getByRole('row', { name: new RegExp(movedName) })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(copiedName) })).toHaveCount(0)

  for (const name of [renamedName, movedName]) {
    row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: '删除' }).click()
    await page.getByRole('dialog', { name: '移入回收站' }).getByRole('button', { name: '移入回收站' }).click()
    await expect(page.getByRole('status')).toContainText(`已将 ${name} 移入回收站`)
  }

  await page.getByRole('button', { name: '回收站' }).click()
  for (const name of [renamedName, movedName]) {
    row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: '永久删除' }).click()
    await page.getByRole('dialog', { name: '永久删除' }).getByRole('button', { name: '永久删除' }).click()
    await expect(page.getByRole('status')).toContainText(`已永久删除 ${name}`)
    await expect(row).toHaveCount(0)
  }
})
