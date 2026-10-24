import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// Fluent Menu 已接管弹层/选项样式，这里只保留无样式触发器按钮与危险项前景色。
export const trigger = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
})

/** 危险操作项：图标与文字用 danger 色（悬停底色沿用 Fluent 中性层） */
export const danger = style({ color: vars.color.danger })
