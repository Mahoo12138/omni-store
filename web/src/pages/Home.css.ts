import { style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const page = style({
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
})

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.md} ${vars.space.lg}`,
  backgroundColor: vars.color.surface,
  borderBottom: `1px solid ${vars.color.border}`,
})

export const logo = style({
  fontSize: vars.fontSize.xl,
  fontWeight: 600,
  color: vars.color.text,
})

export const headerNav = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
})

export const main = style({
  flex: 1,
  width: '100%',
  maxWidth: '960px',
  margin: '0 auto',
  padding: vars.space.lg,
})

export const card = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.sm,
  padding: vars.space.lg,
})

export const title = style({
  fontSize: vars.fontSize.xxl,
  fontWeight: 600,
  margin: 0,
  marginBottom: vars.space.md,
})

export const muted = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

export const statusOk = style({
  color: vars.color.success,
  fontWeight: 600,
})

export const statusBad = style({
  color: vars.color.danger,
  fontWeight: 600,
})
