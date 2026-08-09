import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const page = style({
  width: '100%',
  maxWidth: 1180,
  margin: '0 auto',
  padding: `${vars.space.md} 0 ${vars.space.lg}`,
})

export const hero = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 0.88fr) minmax(540px, 1.12fr)',
  alignItems: 'center',
  gap: '64px',
  minHeight: 390,
  padding: `${vars.space.xl} 0 56px`,
  '@media': {
    'screen and (max-width: 1040px)': {
      gridTemplateColumns: '1fr',
      gap: vars.space.xl,
      paddingTop: vars.space.lg,
    },
    'screen and (max-width: 640px)': {
      gap: vars.space.lg,
      padding: `${vars.space.md} 0 ${vars.space.xl}`,
    },
  },
})

export const heroCopy = style({
  maxWidth: 560,
})

globalStyle(`${heroCopy} h1`, {
  margin: 0,
  color: vars.color.text,
  fontSize: '48px',
  fontWeight: 700,
  lineHeight: 1.12,
  letterSpacing: '-0.045em',
  '@media': {
    'screen and (max-width: 720px)': { fontSize: '40px' },
    'screen and (max-width: 480px)': { fontSize: '34px', lineHeight: 1.16 },
  },
})

globalStyle(`${heroCopy} p`, {
  maxWidth: '52ch',
  margin: `${vars.space.lg} 0 0`,
  color: vars.color.textSecondary,
  fontSize: '17px',
  lineHeight: 1.75,
  textWrap: 'pretty',
  '@media': {
    'screen and (max-width: 480px)': { fontSize: vars.fontSize.lg, lineHeight: 1.7 },
  },
})

export const heroActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginTop: vars.space.lg,
  flexWrap: 'wrap',
})

const actionBase = style({
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
  padding: `0 ${vars.space.md}`,
  borderRadius: vars.radius.md,
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  lineHeight: 1,
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
})

export const primaryAction = style([
  actionBase,
  {
    border: `1px solid ${vars.color.primary}`,
    background: vars.color.primary,
    color: vars.color.textOnPrimary,
    selectors: {
      '&:hover': { borderColor: vars.color.primaryHover, background: vars.color.primaryHover },
      '&:active': { borderColor: vars.color.primaryActive, background: vars.color.primaryActive, transform: 'translateY(1px)' },
    },
  },
])

export const secondaryAction = style([
  actionBase,
  {
    border: `1px solid ${vars.color.borderStrong}`,
    background: vars.color.surface,
    color: vars.color.text,
    selectors: {
      '&:hover': { borderColor: vars.color.primary, background: vars.color.primarySubtle, color: vars.color.primarySubtleInk },
      '&:active': { transform: 'translateY(1px)' },
    },
  },
])

export const flow = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(124px, 1fr) 32px minmax(148px, 1fr) 32px minmax(124px, 1fr)',
  alignItems: 'center',
  gap: '10px',
  color: vars.color.textSecondary,
  '@media': {
    'screen and (max-width: 640px)': {
      gridTemplateColumns: '1fr',
      justifyItems: 'stretch',
      gap: '10px',
    },
  },
})

export const endpointStack = style({
  display: 'grid',
  gap: '12px',
  '@media': {
    'screen and (max-width: 640px)': {
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: vars.space.sm,
    },
  },
})

export const endpoint = style({
  minHeight: 58,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '10px',
  padding: `0 ${vars.space.md}`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  background: vars.color.surface,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  fontWeight: 550,
  '@media': {
    'screen and (max-width: 640px)': {
      minHeight: 54,
      justifyContent: 'center',
      gap: '6px',
      padding: `0 ${vars.space.sm}`,
      fontSize: vars.fontSize.sm,
    },
    'screen and (max-width: 390px)': {
      flexDirection: 'column',
      gap: '4px',
      minHeight: 64,
    },
  },
})

export const connector = style({
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.primary,
  position: 'relative',
  selectors: {
    '&::before': {
      content: '',
      position: 'absolute',
      left: 0,
      right: 8,
      top: '50%',
      height: 1,
      background: vars.color.primary,
      opacity: 0.45,
    },
  },
  '@media': {
    'screen and (max-width: 640px)': {
      width: 32,
      justifySelf: 'center',
      transform: 'rotate(90deg)',
    },
  },
})

globalStyle(`${connector} svg`, {
  position: 'relative',
  zIndex: 1,
  marginLeft: 'auto',
  background: vars.color.background,
})

export const coreNode = style({
  minHeight: 132,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
  padding: vars.space.md,
  border: `1px solid color-mix(in oklch, ${vars.color.primary} 40%, ${vars.color.border})`,
  borderRadius: vars.radius.lg,
  background: vars.color.surface,
  color: vars.color.primary,
  '@media': {
    'screen and (max-width: 640px)': {
      width: 'min(100%, 240px)',
      minHeight: 118,
      justifySelf: 'center',
    },
  },
})

globalStyle(`${coreNode} strong`, {
  color: vars.color.text,
  fontSize: vars.fontSize.lg,
  fontWeight: 700,
  lineHeight: 1.2,
})

globalStyle(`${coreNode} span`, {
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
})

export const detailGrid = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.16fr) minmax(360px, 0.84fr)',
  gap: vars.space.xl,
  padding: `${vars.space.lg} 0 56px`,
  '@media': {
    'screen and (max-width: 900px)': {
      gridTemplateColumns: '1fr',
      gap: '48px',
    },
  },
})

export const usageSection = style({})

export const boundarySection = style({
  paddingLeft: vars.space.xl,
  borderLeft: `1px solid ${vars.color.border}`,
  '@media': {
    'screen and (max-width: 900px)': {
      padding: 0,
      borderLeft: 0,
    },
  },
})

globalStyle(`${usageSection} > h2, ${boundarySection} > h2`, {
  margin: `0 0 ${vars.space.md}`,
  color: vars.color.text,
  fontSize: vars.fontSize.xxl,
  fontWeight: 650,
  lineHeight: 1.3,
})

export const usageList = style({
  borderTop: `1px solid ${vars.color.border}`,
})

export const usageRow = style({
  display: 'grid',
  gridTemplateColumns: '36px 48px minmax(0, 1fr)',
  alignItems: 'start',
  gap: vars.space.md,
  minHeight: 92,
  padding: `${vars.space.md} ${vars.space.sm}`,
  borderBottom: `1px solid ${vars.color.border}`,
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { background: vars.color.surfaceHover },
  },
  '@media': {
    'screen and (max-width: 560px)': {
      gridTemplateColumns: '30px 40px minmax(0, 1fr)',
      gap: '10px',
      alignItems: 'start',
      padding: `${vars.space.md} 0`,
    },
  },
})

export const rowNumber = style({
  color: vars.color.primary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
})

export const rowIcon = style({
  width: 42,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: vars.radius.tile,
  color: vars.color.textSecondary,
})

export const rowCopy = style({
  display: 'grid',
  gridTemplateColumns: '140px minmax(0, 1fr)',
  alignItems: 'baseline',
  gap: vars.space.md,
  '@media': {
    'screen and (max-width: 680px)': {
      gridTemplateColumns: '1fr',
      gap: vars.space.xs,
    },
  },
})

globalStyle(`${rowCopy} h3`, {
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.lg,
  fontWeight: 650,
  lineHeight: 1.45,
})

globalStyle(`${rowCopy} p`, {
  margin: 0,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.65,
})

export const boundaryList = style({
  display: 'grid',
})

export const boundaryRow = style({
  display: 'grid',
  gridTemplateColumns: '48px minmax(0, 1fr)',
  gap: vars.space.md,
  padding: `${vars.space.md} 0`,
  borderBottom: `1px solid ${vars.color.border}`,
  selectors: {
    '&:last-child': { borderBottom: 0 },
  },
})

export const boundaryIcon = style({
  width: 42,
  height: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.primarySubtleInk,
})

globalStyle(`${boundaryRow} h3`, {
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.lg,
  fontWeight: 650,
  lineHeight: 1.45,
})

globalStyle(`${boundaryRow} p`, {
  margin: `${vars.space.xs} 0 0`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.65,
})

export const releaseBand = style({
  minHeight: 104,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.lg,
  padding: `${vars.space.lg} 32px`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  background: vars.color.surface,
  '@media': {
    'screen and (max-width: 720px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
      padding: vars.space.lg,
    },
  },
})

export const releaseIdentity = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  color: vars.color.primary,
})

globalStyle(`${releaseIdentity} > div`, {
  display: 'flex',
  alignItems: 'baseline',
  gap: vars.space.md,
  '@media': {
    'screen and (max-width: 480px)': {
      alignItems: 'flex-start',
      flexDirection: 'column',
      gap: vars.space.xs,
    },
  },
})

globalStyle(`${releaseIdentity} strong`, {
  color: vars.color.text,
  fontSize: vars.fontSize.lg,
  fontWeight: 700,
})

globalStyle(`${releaseIdentity} span`, {
  paddingLeft: vars.space.md,
  borderLeft: `1px solid ${vars.color.borderStrong}`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  '@media': {
    'screen and (max-width: 480px)': {
      paddingLeft: 0,
      borderLeft: 0,
    },
  },
})

export const releaseActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
  '@media': {
    'screen and (max-width: 480px)': {
      display: 'grid',
      gridTemplateColumns: '1fr',
    },
  },
})
