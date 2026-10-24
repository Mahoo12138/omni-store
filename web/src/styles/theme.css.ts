import { createGlobalTheme } from '@vanilla-extract/css'
import { fontStacks, fontSize, motion, palette, radius, space } from './palette'

// 设计 token 来源：docs/index.png + docs/home.png（见 docs/DESIGN_SYSTEM.md）。
// 颜色、间距、圆角、阴影、字号全部从这里取，组件中不写魔法值。
// 原始值定义在 palette.ts，与 Fluent 主题（fluentTheme.ts）及 griffel 样式共享同一色源。
export const vars = createGlobalTheme(':root', {
  color: { ...palette },
  space: { ...space },
  radius: { ...radius },
  shadow: {
    // 卡片只允许极浅单层阴影，不与大模糊阴影叠加
    sm: '0 1px 2px oklch(0.25 0.018 170 / 0.035)',
    md: '0 18px 48px oklch(0.25 0.018 170 / 0.09)',
  },
  fontSize: { ...fontSize },
  font: { ...fontStacks },
  zIndex: {
    dropdown: '10',
    sticky: '20',
    backdrop: '30',
    modal: '40',
    toast: '50',
  },
  motion: { ...motion },
})
