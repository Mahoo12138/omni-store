import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  marginBottom: vars.space.md,
})

export const toolbarGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
})

export const searchBox = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
})

export const searchIcon = style({
  position: 'absolute',
  left: '10px',
  color: vars.color.textSecondary,
  pointerEvents: 'none',
  display: 'inline-flex',
})

export const searchInput = style({
  height: '36px',
  width: '220px',
  padding: '0 12px 0 34px',
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  color: vars.color.text,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  outline: 'none',
  transition: `border-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&::placeholder': { color: vars.color.textSecondary },
    '&:focus': { borderColor: vars.color.primary },
  },
  '@media': {
    'screen and (max-width: 640px)': {
      width: '150px',
    },
  },
})

export const tableWrap = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  overflowX: 'auto',
})

export const table = style({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: vars.fontSize.md,
})

export const th = style({
  textAlign: 'left',
  padding: `12px ${vars.space.md}`,
  color: vars.color.textSecondary,
  fontWeight: 500,
  fontSize: vars.fontSize.sm,
  borderBottom: `1px solid ${vars.color.border}`,
  whiteSpace: 'nowrap',
})

export const row = style({
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover },
  },
})

// vanilla-extract 不允许在 selectors 里写 `&:not(:last-child) td`，
// 改用 globalStyle 在外层包裹：除最后一行外的单元格显示下边框。
globalStyle(`${row}:not(:last-child) td`, {
  borderBottom: `1px solid ${vars.color.border}`,
})

export const td = style({
  padding: `10px ${vars.space.md}`,
  whiteSpace: 'nowrap',
  color: vars.color.textSecondary,
})

export const nameCell = style([
  td,
  {
    whiteSpace: 'normal',
    wordBreak: 'break-all',
    minWidth: '240px',
    width: '100%',
    color: vars.color.text,
  },
])

export const nameInner = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
})

export const nameLink = style({
  color: vars.color.text,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  textAlign: 'left',
  transition: `color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { color: vars.color.primary },
  },
})

export const nameStatic = style({
  color: vars.color.text,
})

export const nameMuted = style({
  color: vars.color.textSecondary,
})

export const actionsCell = style([
  td,
  {
    textAlign: 'right',
  },
])

export const actions = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
})

export const actionBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '30px',
  background: 'none',
  border: 'none',
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.primarySubtle,
      color: vars.color.primary,
    },
  },
})

export const actionBtnDanger = style([
  actionBtn,
  {
    selectors: {
      '&:hover': {
        backgroundColor: vars.color.dangerSubtle,
        color: vars.color.danger,
      },
    },
  },
])

export const empty = style({
  padding: `${vars.space.xl} ${vars.space.lg}`,
  textAlign: 'center',
  color: vars.color.textSecondary,
})

export const emptyTitle = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  color: vars.color.text,
  marginBottom: vars.space.xs,
})

const shimmer = keyframes({
  '0%': { backgroundPosition: '200% 0' },
  '100%': { backgroundPosition: '-200% 0' },
})

export const skeletonRow = style({
  height: '14px',
  margin: `16px ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  background: `linear-gradient(90deg, ${vars.color.surfaceHover} 25%, ${vars.color.border} 50%, ${vars.color.surfaceHover} 75%)`,
  backgroundSize: '200% 100%',
  animation: `${shimmer} 1.4s linear infinite`,
})

export const pager = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: vars.space.sm,
  marginTop: vars.space.md,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
})
