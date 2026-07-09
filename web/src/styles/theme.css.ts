import { createGlobalTheme } from '@vanilla-extract/css'

// 全局主题 token：颜色、间距、圆角、阴影、字号统一从这里取，
// 组件中不允许写魔法值（README §2.3）。
export const vars = createGlobalTheme(':root', {
  color: {
    background: '#f6f7f9',
    surface: '#ffffff',
    border: '#e2e5ea',
    text: '#1d2129',
    textSecondary: '#6b7280',
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    danger: '#dc2626',
    success: '#16a34a',
  },
  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '40px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
  },
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 12px rgba(0, 0, 0, 0.08)',
  },
  fontSize: {
    xs: '12px',
    sm: '13px',
    md: '14px',
    lg: '16px',
    xl: '20px',
    xxl: '28px',
  },
  font: {
    body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  },
})
