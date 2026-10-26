import { expect, test, type Page } from '@playwright/test'

// Stage 6 验收：系统深色 → 全站跟随且滚动条不发白；手动三档刷新后保持。
// 这里守的是机制而不是像素：
// - documentElement[data-theme] 是 global.css 与 index.html 内联脚本共同的接口；
// - color-scheme 必须随之翻转，否则暗底上的滚动条与原生表单控件仍是亮皮；
// - theme=dark 时 FluentProvider 子树的实际底色必须真是 webDarkTheme 的 #292929。

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('OmniStore-Test-Admin!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
}

async function expectTheme(page: Page, theme: 'light' | 'dark') {
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', theme)
  await expect(root).toHaveCSS('color-scheme', theme)
  const surface = theme === 'dark' ? 'rgb(41, 41, 41)' : 'rgb(255, 255, 255)'
  await expect(page.locator('.fui-FluentProvider').first()).toHaveCSS('background-color', surface)
}

async function chooseThemeFromAccountMenu(page: Page, label: '跟随系统' | '浅色' | '深色') {
  await page.getByRole('button', { name: /^账号菜单/ }).click()
  await page.getByRole('menuitemradio', { name: label, exact: true }).click()
  await expect(page.getByRole('menu')).toBeHidden()
}

test('system dark drives the whole app, and switching back is picked up', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/login')
  await expectTheme(page, 'dark')

  await page.emulateMedia({ colorScheme: 'light' })
  await page.reload()
  await expectTheme(page, 'light')
})

test('a manual choice outranks the OS preference and survives reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await loginAsAdmin(page)
  await expectTheme(page, 'dark')

  await chooseThemeFromAccountMenu(page, '浅色')
  await expectTheme(page, 'light')

  await page.reload()
  await expectTheme(page, 'light')

  await chooseThemeFromAccountMenu(page, '深色')
  await expectTheme(page, 'dark')
  await page.reload()
  await expectTheme(page, 'dark')
})

test('the chosen mode is persisted to the account, not only to localStorage', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await loginAsAdmin(page)

  await chooseThemeFromAccountMenu(page, '深色')
  await expectTheme(page, 'dark')

  // 冷启动模拟：抹掉本地存储后由服务端偏好接管（换设备/清缓存后仍是深色）。
  await page.evaluate(() => window.localStorage.removeItem('omnistore:theme-mode'))
  await page.reload()
  await expectTheme(page, 'dark')

  const preferences = await page.evaluate(async () => {
    const response = await fetch('/api/v1/me/preferences')
    return response.json() as Promise<{ data: { theme: string } }>
  })
  expect(preferences.data.theme).toBe('dark')

  // 账号菜单里的勾选态与解析结果一致（MenuItemRadio 的 aria-checked）。
  await page.getByRole('button', { name: /^账号菜单/ }).click()
  await expect(page.getByRole('menuitemradio', { name: '深色', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('menuitemradio', { name: '浅色', exact: true })).toHaveAttribute('aria-checked', 'false')
})

test('the preferences pane exposes the same three modes as a radiogroup', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await loginAsAdmin(page)
  await page.goto('/app/admin?section=preferences')

  const group = page.getByRole('radiogroup', { name: '外观主题' })
  await expect(group).toBeVisible()
  // 不假设账号上的既有档位（e2e 共用一个种子库，档位会跨用例残留）：
  // 先固定到浅色，再逐个验证三档各自的解析结果。
  await group.getByRole('radio', { name: '浅色' }).check()
  await expect(group.getByRole('radio', { name: '浅色' })).toBeChecked()
  await expectTheme(page, 'light')

  await group.getByRole('radio', { name: '跟随系统' }).check()
  await expectTheme(page, 'dark')

  await group.getByRole('radio', { name: '深色' }).check()
  await expectTheme(page, 'dark')

  await group.getByRole('radio', { name: '浅色' }).check()
  await expectTheme(page, 'light')
  // 账号菜单与偏好页共用同一个 store：切换后菜单里的勾选态要跟着变。
  await page.getByRole('button', { name: /^账号菜单/ }).click()
  await expect(page.getByRole('menuitemradio', { name: '浅色', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemradio', { name: '跟随系统', exact: true }).click()
  await expect(page.getByRole('menu')).toBeHidden()
  await expectTheme(page, 'dark')
})

test('anonymous visitors keep a locally stored choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => window.localStorage.setItem('omnistore:theme-mode', 'dark'))

  await page.goto('/')
  await expectTheme(page, 'dark')

  // 未登录时不得因为读不到账号偏好而回落到浅色。
  const preferences = await page.evaluate(async () => {
    const response = await fetch('/api/v1/me/preferences')
    return response.status
  })
  expect(preferences).toBe(401)
})

test('the preview layer keeps its chrome always-dark while the content panel follows the theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await loginAsAdmin(page)
  // 档位是账号级状态，会跨用例残留：这里显式固定到深色再断言面板底色。
  await chooseThemeFromAccountMenu(page, '深色')

  await page.getByRole('button', { name: '打开存储源 公开演示资料' }).click()
  await page.getByRole('row', { name: /README\.txt/ })
    .getByRole('button', { name: 'README.txt', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: '预览 README.txt' })
  await expect(dialog).toBeVisible()

  const readPreviewColors = () => dialog.evaluate((element) => {
    const closeButton = element.querySelector<HTMLElement>('.omnistore-preview-headerBtn')
    const textPanel = element.querySelector<HTMLElement>('.omnistore-preview-textWrap')
    return {
      overlayBackground: getComputedStyle(element).backgroundColor,
      closeColor: closeButton ? getComputedStyle(closeButton).color : '',
      panelBackground: textPanel ? getComputedStyle(textPanel).backgroundColor : '',
    }
  })

  const onDark = await readPreviewColors()
  expect(onDark.overlayBackground, '遮罩底色解析出来了').not.toBe('rgba(0, 0, 0, 0)')
  expect(onDark.closeColor, '工具条字色解析出来了').not.toBe('rgba(0, 0, 0, 0)')
  // 内容面板跟随主题:深色档下是 webDarkTheme 的 colorNeutralBackground1。
  expect(onDark.panelBackground).toBe('rgb(41, 41, 41)')

  // always-dark 契约:同一处预览在浅色主题下,遮罩与工具条字色一个字节都不许变,
  // 只有内容面板跟着翻转 —— 这正是"遮罩层不接全局主题"的可执行定义。
  await page.getByRole('button', { name: '关闭预览' }).click()
  await chooseThemeFromAccountMenu(page, '浅色')
  await expectTheme(page, 'light')
  // 关掉预览后停在文件管理器；源卡片在首页，回 /app 再进同一条路径。
  await page.goto('/app')
  await page.getByRole('button', { name: '打开存储源 公开演示资料' }).click()
  await page.getByRole('row', { name: /README\.txt/ })
    .getByRole('button', { name: 'README.txt', exact: true })
    .click()
  const onLight = await readPreviewColors()
  expect(onLight.overlayBackground).toBe(onDark.overlayBackground)
  expect(onLight.closeColor).toBe(onDark.closeColor)
  expect(onLight.panelBackground).toBe('rgb(255, 255, 255)')

  // 收摊：把共享种子库里的账号档位放回跟随系统，避免影响后续用例。
  await page.getByRole('button', { name: '关闭预览' }).click()
  await chooseThemeFromAccountMenu(page, '跟随系统')
  await expectTheme(page, 'dark')
})
