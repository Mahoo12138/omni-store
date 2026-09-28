import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: vars.zIndex.modal,
  background: 'oklch(0.2 0.03 258 / 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: vars.space.md,
})

export const card = style({
  position: 'relative',
  width: '100%',
  maxWidth: 320,
  padding: vars.space.lg,
  background: vars.color.surface,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.md,
  textAlign: 'center',
})

export const close = style({
  position: 'absolute',
  top: vars.space.sm,
  right: vars.space.sm,
  display: 'inline-flex',
  padding: vars.space.xs,
  border: 0,
  borderRadius: vars.radius.sm,
  background: 'transparent',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  selectors: {
    '&:hover': { background: vars.color.surfaceHover, color: vars.color.text },
    '&:focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
  },
})

export const title = style({
  margin: `0 0 ${vars.space.md}`,
  color: vars.color.text,
  fontSize: vars.fontSize.lg,
  overflowWrap: 'anywhere',
})

export const qrWrap = style({
  display: 'flex',
  justifyContent: 'center',
  padding: vars.space.md,
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
})

export const urlText = style({
  margin: `${vars.space.md} 0 0`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  overflowWrap: 'anywhere',
})
