import { webLightTheme, webDarkTheme, type Theme } from '@fluentui/react-components'

// 直接采用 Fluent UI 官方 Web 主题（设计语言、颜色、圆角、字体、交互全部原生）。
// 暗色切换由 components/theme/AppThemeProvider 按 utils/themeMode 的解析结果选
// appLightTheme / appDarkTheme；尺寸与断点常量见 styles/layout.ts 与 styles/media.ts，
// 不在这里扩展 token。

export const appLightTheme: Theme = webLightTheme

export const appDarkTheme: Theme = webDarkTheme
