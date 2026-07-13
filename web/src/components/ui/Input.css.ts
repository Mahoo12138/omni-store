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
  height: '36px',
  padding: `0 ${vars.space.md}`,
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  color: vars.color.text,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  outline: 'none',
  transition: `border-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&::placeholder': {
      // 占位文本同样满足对比度要求
      color: vars.color.textSecondary,
    },
    '&:hover:not(:disabled)': {
      borderColor: vars.color.borderStrong,
    },
    '&:focus': {
      borderColor: vars.color.primary,
    },
  },
})
