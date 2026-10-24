import { createGlobalTheme } from '@vanilla-extract/css'
import { fontStacks, palette } from './palette'

// 设计 token 来源：docs/index.png + docs/home.png（见 docs/DESIGN_SYSTEM.md）。
// 颜色、间距、圆角、阴影、字号全部从这里取，组件中不写魔法值。
// 色值与字体栈的原始定义在 palette.ts，与 Fluent 主题（fluentTheme.ts）共享同一色源。
export const vars = createGlobalTheme(':root', {
  color: { ...palette },
  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '40px',
  },
  radius: {
    sm: '5px',
    md: '10px',
    lg: '18px',
    tile: '12px',
    full: '999px',
  },
  shadow: {
    // 卡片只允许极浅单层阴影，不与大模糊阴影叠加
    sm: '0 1px 2px oklch(0.25 0.018 170 / 0.035)',
    md: '0 18px 48px oklch(0.25 0.018 170 / 0.09)',
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
  font: { ...fontStacks },
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
