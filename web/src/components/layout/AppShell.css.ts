import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const shell = style({
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
})

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  padding: `${vars.space.md} ${vars.space.lg}`,
  backgroundColor: vars.color.surface,
  borderBottom: `1px solid ${vars.color.border}`,
})

export const logo = style({
  fontSize: vars.fontSize.xl,
  fontWeight: 600,
  color: vars.color.text,
  textDecoration: 'none',
})

export const nav = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.space.md,
})

export const navLink = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  selectors: {
    '&:hover': { color: vars.color.primary },
  },
})

export const userName = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

export const main = style({
  flex: 1,
  width: '100%',
  maxWidth: '1080px',
  margin: '0 auto',
  padding: vars.space.lg,
})
