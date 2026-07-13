import { style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const section = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: vars.space.lg,
  marginBottom: vars.space.lg,
})

export const sectionTitle = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  margin: 0,
  marginBottom: vars.space.md,
})

export const row = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  marginBottom: vars.space.sm,
})

export const label = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
})

export const select = style({
  height: '36px',
  padding: `0 ${vars.space.md}`,
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  color: vars.color.text,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  outline: 'none',
})

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: vars.space.md,
})

export const imageCard = style({
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  backgroundColor: vars.color.surface,
})

export const imageThumb = style({
  width: '100%',
  height: '120px',
  objectFit: 'cover',
  display: 'block',
  backgroundColor: vars.color.background,
})

export const imageMeta = style({
  padding: vars.space.sm,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
})

export const imageActions = style({
  display: 'flex',
  gap: '2px',
  padding: `0 ${vars.space.sm} ${vars.space.sm}`,
})

export const actionBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  background: 'none',
  border: 'none',
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover, color: vars.color.text },
  },
})

export const actionBtnDanger = style([
  actionBtn,
  {
    selectors: {
      '&:hover': { backgroundColor: vars.color.dangerSubtle, color: vars.color.danger },
    },
  },
])

export const pager = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: vars.space.sm,
  marginTop: vars.space.md,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
})

export const emptyBlock = style({
  padding: `${vars.space.lg} ${vars.space.md}`,
  color: vars.color.textSecondary,
})

export const tokenBox = style({
  display: 'block',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  backgroundColor: vars.color.background,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: vars.space.sm,
  width: '100%',
  wordBreak: 'break-all',
  resize: 'vertical',
})

export const error = style({
  color: vars.color.danger,
  fontSize: vars.fontSize.sm,
})
