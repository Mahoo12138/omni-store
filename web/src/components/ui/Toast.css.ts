import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const notice = style({
  width: 'min(360px, calc(100vw - 32px))',
  padding: `${vars.space.sm} ${vars.space.md}`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.md,
  backgroundColor: vars.color.surface,
  color: vars.color.text,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.5,
})

export const success = style({
  borderColor: 'oklch(0.82 0.12 150)',
  color: vars.color.success,
})

export const error = style({
  borderColor: 'oklch(0.82 0.12 27)',
  color: vars.color.danger,
})

export const info = style({
  borderColor: vars.color.borderStrong,
  color: vars.color.primarySubtleInk,
})
