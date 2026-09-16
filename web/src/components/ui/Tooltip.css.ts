import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const trigger = style({
  display: 'inline-flex',
  flexShrink: 0,
})

export const popup = style({
  maxWidth: 'min(320px, calc(100vw - 32px))',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  border: `1px solid ${vars.color.borderStrong}`,
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.text,
  boxShadow: vars.shadow.sm,
  color: vars.color.textOnPrimary,
  fontSize: vars.fontSize.xs,
  lineHeight: 1.5,
})
