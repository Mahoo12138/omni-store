import { style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const page = style({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: vars.space.md,
})

export const card = style({
  width: '100%',
  maxWidth: '380px',
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.sm,
  padding: vars.space.xl,
})

export const brand = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  marginBottom: vars.space.lg,
})

export const brandName = style({
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  color: vars.color.text,
})

export const subtitle = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  margin: 0,
  marginBottom: vars.space.lg,
  textAlign: 'center',
})

export const form = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
})

export const error = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.danger,
  margin: 0,
})

export const footer = style({
  marginTop: vars.space.md,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  textAlign: 'center',
})
