import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// Input 的 label/hint 内联模式布局（输入框本体已迁移到 Fluent Input + griffel 样式）
export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
})

export const label = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
})

export const hint = style({
  fontSize: vars.fontSize.xs,
  lineHeight: 1.45,
  color: vars.color.textSecondary,
})
