import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// 弹窗 / 表单里的字段：label + 控件 + hint（错误时变红）
export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minWidth: 0,
})

export const label = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  color: vars.color.text,
})

export const hint = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  minHeight: '1em',
})

export const hintError = style([
  hint,
  {
    color: vars.color.danger,
  },
])

export const textarea = style({
  width: '100%',
  minHeight: '100px',
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.mono,
  color: vars.color.text,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  outline: 'none',
  resize: 'vertical',
  transition: `border-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { borderColor: vars.color.borderStrong },
    '&:focus': { borderColor: vars.color.primary },
  },
})

// 复选框行：checkbox + label 同行展示
export const checkboxRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  fontSize: vars.fontSize.sm,
  color: vars.color.text,
  cursor: 'pointer',
})

export const checkbox = style({
  width: '16px',
  height: '16px',
  margin: 0,
  cursor: 'pointer',
})

// 弹窗内多字段时的两列栅格
export const grid2 = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: vars.space.md,
  '@media': {
    'screen and (max-width: 480px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
})
