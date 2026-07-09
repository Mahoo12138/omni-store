import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
})

export const label = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
})

export const input = style({
  width: '100%',
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  color: vars.color.text,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  outline: 'none',
  selectors: {
    '&:focus': {
      borderColor: vars.color.primary,
    },
  },
})
