import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// Dialog（base-ui）容器、面板、背景层
export const viewport = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: vars.zIndex.modal,
})

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'oklch(0.2 0.02 262 / 0.45)',
  backdropFilter: 'blur(2px)',
  zIndex: vars.zIndex.modal,
})

export const popup = style({
  position: 'relative',
  zIndex: vars.zIndex.modal,
  width: 'min(480px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 64px)',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.md,
  outline: 'none',
})

// 弹窗变体：宽版本（用于编辑复杂表单）
export const popupWide = style([
  popup,
  {
    width: 'min(640px, calc(100vw - 32px))',
  },
])

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.md,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
})

export const title = style({
  margin: 0,
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  color: vars.color.text,
})

export const description = style({
  margin: 0,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
})

export const close = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  padding: 0,
  border: 'none',
  borderRadius: vars.radius.md,
  background: 'transparent',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.surfaceHover,
      color: vars.color.text,
    },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.primary}`,
      outlineOffset: '2px',
    },
  },
})

export const body = style({
  padding: vars.space.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  overflowY: 'auto',
  minHeight: 0,
})

export const footer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: vars.space.sm,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderTop: `1px solid ${vars.color.border}`,
  flexShrink: 0,
})

// base-ui 的 Dialog 内部使用 data-state 等属性。
// 给弹窗与背景层提供 enter/exit 过渡；默认不依赖 JS 动画，直接静态展示。
globalStyle(`${popup}[data-state="open"]`, { animation: 'none' })
globalStyle(`${backdrop}[data-state="open"]`, { animation: 'none' })
