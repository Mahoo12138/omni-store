import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const archiveHero = style({
  position: 'relative',
  minHeight: 336,
  overflow: 'hidden',
  padding: `${vars.space.lg} 48px 72px`,
  borderRadius: vars.radius.lg,
  background: vars.color.text,
  color: vars.color.surface,
  selectors: {
    '&::after': {
      content: '',
      position: 'absolute',
      right: '-8%',
      bottom: '-64%',
      width: '42%',
      aspectRatio: '1',
      border: `1px solid color-mix(in oklch, ${vars.color.surface} 10%, transparent)`,
      borderRadius: '50%',
      pointerEvents: 'none',
    },
  },
  '@media': {
    'screen and (max-width: 720px)': {
      minHeight: 0,
      padding: `${vars.space.md} ${vars.space.lg} 64px`,
    },
    'screen and (max-width: 480px)': {
      padding: `${vars.space.md} ${vars.space.md} 56px`,
    },
  },
})

export const masthead = style({
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.lg,
  paddingBottom: vars.space.lg,
  borderBottom: `1px solid color-mix(in oklch, ${vars.color.surface} 14%, transparent)`,
  '@media': {
    'screen and (max-width: 640px)': {
      alignItems: 'flex-start',
      flexDirection: 'column',
      gap: vars.space.md,
    },
  },
})

export const brand = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '12px',
  color: vars.color.primary,
})

globalStyle(`${brand} > span`, {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
})

globalStyle(`${brand} strong`, {
  color: vars.color.surface,
  fontSize: vars.fontSize.lg,
  fontWeight: 700,
  lineHeight: 1.15,
  letterSpacing: '-0.02em',
})

globalStyle(`${brand} small`, {
  color: vars.color.surface,
  opacity: 0.48,
  fontSize: '10px',
  fontWeight: 650,
  lineHeight: 1.2,
  letterSpacing: '0.14em',
})

export const utilityLinks = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
})

export const imageBedLink = style({
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `0 ${vars.space.md}`,
  border: `1px solid color-mix(in oklch, ${vars.color.surface} 16%, transparent)`,
  borderRadius: vars.radius.md,
  background: `color-mix(in oklch, ${vars.color.surface} 6%, transparent)`,
  color: vars.color.surface,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      borderColor: `color-mix(in oklch, ${vars.color.surface} 30%, transparent)`,
      background: `color-mix(in oklch, ${vars.color.surface} 11%, transparent)`,
    },
    '&:active': { transform: 'translateY(1px)' },
  },
})

export const authLink = style({
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  padding: `0 ${vars.space.sm}`,
  color: vars.color.surface,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  opacity: 0.72,
  transition: `opacity ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { opacity: 1 },
  },
})

export const authPlaceholder = style({
  width: 72,
  height: 14,
  borderRadius: vars.radius.sm,
  background: `color-mix(in oklch, ${vars.color.surface} 12%, transparent)`,
})

export const heroBody = style({
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'end',
  gap: vars.space.xl,
  paddingTop: 48,
  '@media': {
    'screen and (max-width: 640px)': {
      gridTemplateColumns: '1fr',
      alignItems: 'start',
      gap: vars.space.lg,
      paddingTop: vars.space.xl,
    },
  },
})

export const heroCopy = style({
  maxWidth: '650px',
})

export const sectionLabel = style({
  color: vars.color.surface,
  opacity: 0.48,
  fontSize: vars.fontSize.xs,
  fontWeight: 650,
  letterSpacing: '0.08em',
})

globalStyle(`${heroCopy} h1`, {
  margin: `${vars.space.sm} 0 0`,
  color: vars.color.surface,
  fontSize: '48px',
  fontWeight: 700,
  lineHeight: 1.05,
  letterSpacing: '-0.045em',
})

globalStyle(`${heroCopy} p`, {
  maxWidth: '54ch',
  margin: `${vars.space.md} 0 0`,
  color: vars.color.surface,
  opacity: 0.66,
  fontSize: vars.fontSize.lg,
  lineHeight: 1.65,
  textWrap: 'pretty',
})

export const directoryCount = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: vars.space.sm,
  paddingBottom: '4px',
  whiteSpace: 'nowrap',
})

globalStyle(`${directoryCount} strong`, {
  color: vars.color.surface,
  fontFamily: vars.font.mono,
  fontSize: '40px',
  fontWeight: 500,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
  letterSpacing: '-0.05em',
})

globalStyle(`${directoryCount} span`, {
  color: vars.color.surface,
  opacity: 0.55,
  fontSize: vars.fontSize.sm,
})

export const directorySection = style({
  position: 'relative',
  zIndex: 2,
  margin: '-32px 24px 0',
  '@media': {
    'screen and (max-width: 720px)': { margin: '-28px 12px 0' },
    'screen and (max-width: 480px)': { margin: '-24px 0 0' },
  },
})

export const directoryHeader = style({
  minHeight: 76,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.md,
  padding: `0 ${vars.space.lg}`,
  border: `1px solid ${vars.color.border}`,
  borderBottom: 0,
  borderRadius: `${vars.radius.lg} ${vars.radius.lg} 0 0`,
  background: vars.color.surface,
  boxShadow: `0 -8px 28px oklch(0.18 0.03 258 / 0.08)`,
  '@media': {
    'screen and (max-width: 560px)': { padding: `0 ${vars.space.md}` },
  },
})

globalStyle(`${directoryHeader} > div`, { display: 'flex', alignItems: 'center' })

globalStyle(`${directoryHeader} h2`, {
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.xl,
  fontWeight: 650,
})

globalStyle(`${directoryHeader} p`, {
  margin: 0,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

export const directoryPanel = style({
  minHeight: 216,
  padding: vars.space.md,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  border: `1px solid ${vars.color.border}`,
  borderTop: 0,
  borderBottomLeftRadius: vars.radius.lg,
  borderBottomRightRadius: vars.radius.lg,
  backgroundColor: vars.color.surface,
  overflow: 'hidden',
  boxShadow: vars.shadow.sm,
})

export const mountGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
  gap: vars.space.sm,
  '@media': {
    'screen and (max-width: 480px)': {
      gridTemplateColumns: '1fr',
    },
  },
})

export const mountCard = style({
  minWidth: 0,
  minHeight: 166,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: vars.space.sm,
  padding: vars.space.md,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.surface,
  color: vars.color.text,
  textAlign: 'left',
  fontFamily: vars.font.body,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}, box-shadow ${vars.motion.fast} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      borderColor: vars.color.borderStrong,
      backgroundColor: vars.color.surfaceHover,
      boxShadow: vars.shadow.sm,
      transform: 'translateY(-1px)',
    },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.primary}`,
      outlineOffset: '2px',
    },
    '&:active': { transform: 'translateY(0)' },
  },
})

export const mountCardTop = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
})

export const mountIcon = style({
  width: 38,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.primarySubtle,
  color: vars.color.primary,
})

export const mountKind = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
})

export const mountArrow = style({
  marginLeft: 'auto',
  color: vars.color.textSecondary,
  transition: `transform ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    [`${mountCard}:hover &`]: { color: vars.color.primary, transform: 'translateX(2px)' },
  },
})

export const mountName = style({
  overflow: 'hidden',
  color: vars.color.text,
  fontSize: vars.fontSize.lg,
  fontWeight: 650,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const mountPath = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
})

globalStyle(`${mountPath} code`, {
  minWidth: 0,
  overflow: 'hidden',
  padding: '2px 6px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.background,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const mountDescription = style({
  display: '-webkit-box',
  overflow: 'hidden',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.45,
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  textWrap: 'pretty',
})

export const mountSkeleton = style({
  minHeight: 166,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: vars.space.sm,
  padding: vars.space.md,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
})

const skeletonBlock = style({
  display: 'block',
  height: '12px',
  borderRadius: vars.radius.sm,
  background: `linear-gradient(90deg, ${vars.color.surfaceHover} 25%, ${vars.color.border} 50%, ${vars.color.surfaceHover} 75%)`,
  backgroundSize: '200% 100%',
})

export const mountSkeletonIcon = style([
  skeletonBlock,
  { width: '36px', height: '34px' },
])

export const mountSkeletonLine = style([skeletonBlock, { width: '58%' }])
export const mountSkeletonLineShort = style([skeletonBlock, { width: '82%' }])

export const emptyState = style({
  minHeight: 216,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.lg,
  padding: `${vars.space.xl} ${vars.space.lg}`,
  textAlign: 'left',
  '@media': {
    'screen and (max-width: 560px)': {
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      padding: `${vars.space.xl} ${vars.space.md}`,
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
  background: vars.color.primarySubtle,
  color: vars.color.primary,
})

export const errorState = style({
  minHeight: 216,
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
  minHeight: 40,
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
