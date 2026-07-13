import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// --- 页面标题 + 操作按钮（admin 子页面共用） ---

export const pageHeader = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.space.md,
  marginTop: vars.space.lg,
  marginBottom: vars.space.md,
})

export const pageTitle = style({
  flex: 1,
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  color: vars.color.text,
  margin: 0,
})

export const pageActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
})
