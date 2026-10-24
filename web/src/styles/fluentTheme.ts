import { webLightTheme, webDarkTheme, type Theme } from '@fluentui/react-components'

// 直接采用 Fluent UI 官方 Web 主题（设计语言、颜色、圆角、字体、交互全部原生）。
// 需要品牌化或暗色切换时在此统一扩展（例如 overrideTokens 或按 prefers-color-scheme
// 切换 appDarkTheme）；业务专属色（文件类型砖/Logo）见 palette.ts，与主题无关。

export const appLightTheme: Theme = webLightTheme

export const appDarkTheme: Theme = webDarkTheme
