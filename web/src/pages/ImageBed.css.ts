import { style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const section = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
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
  wordBreak: 'break-all',
})

export const imageActions = style({
  display: 'flex',
  gap: vars.space.xs,
  padding: `0 ${vars.space.sm} ${vars.space.sm}`,
})

export const select = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  color: vars.color.text,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
})

export const tokenBox = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  backgroundColor: vars.color.background,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: vars.space.sm,
  wordBreak: 'break-all',
})

export const muted = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

export const error = style({
  color: vars.color.danger,
  fontSize: vars.fontSize.sm,
})
