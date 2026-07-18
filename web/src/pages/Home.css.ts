import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const hero = style({
  minHeight: 176,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: vars.space.xl,
  padding: `${vars.space.xl} 48px`,
  borderRadius: vars.radius.lg,
  background: vars.color.text,
  color: vars.color.surface,
  overflow: 'hidden',
  '@media': {
    'screen and (max-width: 720px)': {
      minHeight: 0,
      gridTemplateColumns: '1fr',
      gap: vars.space.lg,
      padding: `${vars.space.xl} ${vars.space.lg}`,
    },
  },
})

export const heroCopy = style({
  maxWidth: '620px',
})

globalStyle(`${heroCopy} h1`, {
  margin: 0,
  color: vars.color.surface,
  fontSize: vars.fontSize.display,
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: '-0.03em',
})

globalStyle(`${heroCopy} p`, {
  maxWidth: '58ch',
  margin: `${vars.space.sm} 0 0`,
  color: vars.color.surface,
  opacity: 0.72,
  fontSize: vars.fontSize.lg,
  lineHeight: 1.55,
  textWrap: 'pretty',
})

export const heroAside = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  padding: vars.space.md,
  border: `1px solid color-mix(in oklch, ${vars.color.surface} 16%, transparent)`,
  borderRadius: vars.radius.tile,
  background: `color-mix(in oklch, ${vars.color.surface} 6%, transparent)`,
  '@media': {
    'screen and (max-width: 720px)': {
      width: 'fit-content',
    },
  },
})

export const heroIcon = style({
  width: 52,
  height: 52,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: vars.radius.tile,
  background: vars.color.primary,
  color: vars.color.textOnPrimary,
})

export const heroStatus = style({
  maxWidth: '14ch',
  color: vars.color.surface,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  lineHeight: 1.4,
})

export const locationBar = style({
  minHeight: 72,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.md,
})

export const locationMeta = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
})

export const directoryPanel = style({
  minHeight: 188,
})

export const loadingState = style({
  padding: `${vars.space.sm} 0`,
})

export const emptyState = style({
  minHeight: 188,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.lg,
  padding: vars.space.xl,
  textAlign: 'left',
  '@media': {
    'screen and (max-width: 560px)': {
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      padding: vars.space.lg,
    },
  },
})

export const emptyIcon = style({
  width: 56,
  height: 56,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: vars.radius.tile,
  background: vars.color.tileAmberBg,
  color: vars.color.tileAmberFg,
})

export const errorState = style({
  minHeight: 188,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.lg,
  padding: vars.space.xl,
  '@media': {
    'screen and (max-width: 560px)': {
      alignItems: 'flex-start',
      flexDirection: 'column',
      padding: vars.space.lg,
    },
  },
})

globalStyle(`${emptyState} h2, ${errorState} h2`, {
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.xl,
  fontWeight: 650,
  lineHeight: 1.3,
})

globalStyle(`${emptyState} p, ${errorState} p`, {
  maxWidth: '58ch',
  margin: `${vars.space.sm} 0 0`,
  color: vars.color.textSecondary,
  lineHeight: 1.55,
  textWrap: 'pretty',
})

globalStyle(`${errorState} button`, {
  minHeight: 36,
  padding: `0 ${vars.space.md}`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  background: vars.color.surface,
  color: vars.color.text,
  fontWeight: 600,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
})

globalStyle(`${errorState} button:hover`, {
  borderColor: vars.color.borderStrong,
  background: vars.color.surfaceHover,
})

globalStyle(`${errorState} button:active`, {
  transform: 'translateY(1px)',
})

globalStyle(`${errorState} button`, {
  '@media': {
    'screen and (max-width: 820px)': {
      minHeight: 44,
    },
  },
})
