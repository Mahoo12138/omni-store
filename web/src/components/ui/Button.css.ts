import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

const base = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xs,
  border: 'none',
  borderRadius: vars.radius.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
  selectors: {
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
})

export const button = styleVariants({
  primary: [
    base,
    {
      backgroundColor: vars.color.primary,
      color: vars.color.surface,
      selectors: {
        '&:hover:not(:disabled)': { backgroundColor: vars.color.primaryHover },
      },
    },
  ],
  secondary: [
    base,
    {
      backgroundColor: vars.color.surface,
      color: vars.color.text,
      border: `1px solid ${vars.color.border}`,
      selectors: {
        '&:hover:not(:disabled)': { backgroundColor: vars.color.background },
      },
    },
  ],
  danger: [
    base,
    {
      backgroundColor: vars.color.danger,
      color: vars.color.surface,
      selectors: {
        '&:hover:not(:disabled)': { opacity: 0.9 },
      },
    },
  ],
})
