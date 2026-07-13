import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

// 视图切换按钮组：列表 / 网格（docs/index.png 右上角）。
export const viewToggle = style({
  display: 'inline-flex',
  alignItems: 'center',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: '2px',
  backgroundColor: vars.color.surface,
})

const viewToggleBtnBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '28px',
  background: 'none',
  border: 'none',
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { color: vars.color.text },
  },
})

export const viewToggleBtn = viewToggleBtnBase

export const viewToggleBtnActive = style([
  viewToggleBtnBase,
  {
    backgroundColor: vars.color.primarySubtle,
    color: vars.color.primary,
    selectors: {
      '&:hover': { color: vars.color.primary },
    },
  },
])

// 网格视图容器（docs/index.png 切换后的样子）。
export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: vars.space.md,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: vars.space.md,
})

const gridCardBase = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: vars.space.md,
  border: `1px solid transparent`,
  borderRadius: vars.radius.md,
  backgroundColor: 'transparent',
  color: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  textAlign: 'center',
  fontFamily: vars.font.body,
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.surfaceHover,
      borderColor: vars.color.border,
    },
  },
})

export const gridCard = gridCardBase

export const gridIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
})

export const gridName = style({
  fontSize: vars.fontSize.md,
  fontWeight: 500,
  color: vars.color.text,
  wordBreak: 'break-all',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
})

export const gridMeta = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
})

export const gridEmpty = style({
  padding: `${vars.space.xl} ${vars.space.lg}`,
  textAlign: 'center',
  color: vars.color.textSecondary,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
})

export const gridEmptyTitle = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  color: vars.color.text,
  marginBottom: vars.space.xs,
})

const shimmer = keyframes({
  '0%': { backgroundPosition: '200% 0' },
  '100%': { backgroundPosition: '-200% 0' },
})

// 复用骨架占位：与 FileTable 一致
export const skeleton = style({
  height: '14px',
  borderRadius: vars.radius.sm,
  background: `linear-gradient(90deg, ${vars.color.surfaceHover} 25%, ${vars.color.border} 50%, ${vars.color.surfaceHover} 75%)`,
  backgroundSize: '200% 100%',
  animation: `${shimmer} 1.4s linear infinite`,
})
