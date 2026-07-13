import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

const base = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  border: 'none',
  borderRadius: vars.radius.md,
  padding: `0 ${vars.space.md}`,
  height: '36px',
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
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
      color: vars.color.textOnPrimary,
      selectors: {
        '&:hover:not(:disabled)': { backgroundColor: vars.color.primaryHover },
        '&:active:not(:disabled)': { backgroundColor: vars.color.primaryActive },
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
        '&:hover:not(:disabled)': {
          borderColor: vars.color.borderStrong,
          backgroundColor: vars.color.surfaceHover,
        },
      },
    },
  ],
  danger: [
    base,
    {
      backgroundColor: vars.color.danger,
      color: vars.color.textOnPrimary,
      selectors: {
        '&:hover:not(:disabled)': { backgroundColor: vars.color.dangerHover },
      },
    },
  ],
  // 图标钮：工具栏刷新、行内操作
  ghost: [
    base,
    {
      backgroundColor: 'transparent',
      color: vars.color.textSecondary,
      padding: `0 ${vars.space.sm}`,
      selectors: {
        '&:hover:not(:disabled)': {
          backgroundColor: vars.color.surfaceHover,
          color: vars.color.text,
        },
      },
    },
  ],
})
