import { createGlobalTheme } from '@vanilla-extract/css'

// 设计 token 来源：docs/index.png + docs/home.png（见 DESIGN.md）。
// 颜色、间距、圆角、阴影、字号全部从这里取，组件中不写魔法值。
export const vars = createGlobalTheme(':root', {
  color: {
    // 品牌蓝：唯一动作色
    primary: 'oklch(0.52 0.18 257)',
    primaryHover: 'oklch(0.46 0.18 257)',
    primaryActive: 'oklch(0.41 0.17 257)',
    primarySubtle: 'oklch(0.955 0.025 257)',
    primarySubtleInk: 'oklch(0.43 0.17 257)',

    // 中性层：冷调，向品牌色轻微偏移
    background: 'oklch(0.982 0.006 248)',
    surface: 'oklch(1 0 0)',
    surfaceHover: 'oklch(0.965 0.01 248)',
    border: 'oklch(0.91 0.012 248)',
    borderStrong: 'oklch(0.82 0.018 248)',

    text: 'oklch(0.25 0.035 258)',
    textSecondary: 'oklch(0.49 0.03 255)',
    textOnPrimary: 'oklch(1 0 0)',

    // 语义状态
    success: 'oklch(0.56 0.15 150)',
    successSubtle: 'oklch(0.95 0.04 150)',
    danger: 'oklch(0.55 0.19 27)',
    dangerHover: 'oklch(0.49 0.19 27)',
    dangerSubtle: 'oklch(0.95 0.03 27)',
    warning: 'oklch(0.62 0.14 75)',

    // 图标砖成对色：识别实体用，不做装饰
    tileBlueBg: 'oklch(0.94 0.045 262)',
    tileBlueFg: 'oklch(0.55 0.2 262)',
    tileGreenBg: 'oklch(0.94 0.05 150)',
    tileGreenFg: 'oklch(0.52 0.14 150)',
    tileAmberBg: 'oklch(0.95 0.05 80)',
    tileAmberFg: 'oklch(0.6 0.13 70)',
    tilePurpleBg: 'oklch(0.94 0.045 300)',
    tilePurpleFg: 'oklch(0.53 0.17 300)',
    tileTealBg: 'oklch(0.94 0.05 200)',
    tileTealFg: 'oklch(0.52 0.11 210)',
    tileRedBg: 'oklch(0.94 0.035 27)',
    tileRedFg: 'oklch(0.55 0.19 27)',
  },
  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '40px',
  },
  radius: {
    sm: '5px',
    md: '9px',
    lg: '14px',
    tile: '10px',
    full: '999px',
  },
  shadow: {
    // 卡片只允许极浅单层阴影，不与大模糊阴影叠加
    sm: '0 1px 2px oklch(0.25 0.035 258 / 0.05)',
    md: '0 14px 36px oklch(0.25 0.035 258 / 0.10)',
  },
  fontSize: {
    xs: '12px',
    sm: '13px',
    md: '14px',
    lg: '16px',
    xl: '20px',
    xxl: '24px',
    display: '32px',
  },
  font: {
    body: "Aptos, 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    mono: "ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  },
  zIndex: {
    dropdown: '10',
    sticky: '20',
    backdrop: '30',
    modal: '40',
    toast: '50',
  },
  motion: {
    fast: '150ms',
    base: '200ms',
    ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
})
