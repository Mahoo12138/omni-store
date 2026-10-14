import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// 项目内的标签页和视图切换统一使用 outline 外观。
export const outlineList = style({
  display: 'inline-flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: vars.space.sm,
})

export const outlineTab = style({
  appearance: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xs,
  minHeight: 36,
  padding: `0 ${vars.space.md}`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.surface,
  color: vars.color.textSecondary,
  font: 'inherit',
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: `border-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}, background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&[data-active], &[aria-selected="true"], &[aria-pressed="true"]': {
      borderColor: vars.color.primary,
      backgroundColor: vars.color.primarySubtle,
      color: vars.color.primarySubtleInk,
    },
    '&:hover:not(:disabled)': { borderColor: vars.color.primary, color: vars.color.primarySubtleInk },
    '&:focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
    '&:disabled': { opacity: 0.45, cursor: 'not-allowed' },
  },
  '@media': {
    'screen and (max-width: 820px)': { minHeight: 44 },
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
})

export const outlineIconTab = style([
  outlineTab,
  {
    width: 36,
    padding: 0,
    '@media': { 'screen and (max-width: 820px)': { width: 44 } },
  },
])
