import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

const spin = keyframes({
  to: { transform: 'rotate(360deg)' },
})

const progress = keyframes({
  from: { transform: 'translateX(-110%)' },
  to: { transform: 'translateX(360%)' },
})

export const page = style({
  width: '100%',
  maxWidth: 1180,
  margin: '0 auto',
  padding: `0 0 ${vars.space.xl}`,
})

export const hero = style({
  position: 'relative',
  minHeight: 334,
  overflow: 'hidden',
  padding: `${vars.space.lg} 48px 76px`,
  borderRadius: vars.radius.lg,
  background: vars.color.text,
  color: vars.color.surface,
  selectors: {
    '&::after': {
      content: '',
      position: 'absolute',
      right: '-3%',
      bottom: '-74%',
      width: '40%',
      aspectRatio: '1',
      border: `1px solid color-mix(in oklch, ${vars.color.surface} 10%, transparent)`,
      borderRadius: '50%',
      pointerEvents: 'none',
    },
    '&::before': {
      content: '',
      position: 'absolute',
      right: '15%',
      bottom: '-66%',
      width: '28%',
      aspectRatio: '1',
      border: `1px solid color-mix(in oklch, ${vars.color.surface} 6%, transparent)`,
      borderRadius: '50%',
      pointerEvents: 'none',
    },
  },
  '@media': {
    'screen and (max-width: 720px)': {
      minHeight: 0,
      padding: `${vars.space.md} ${vars.space.lg} 70px`,
    },
    'screen and (max-width: 480px)': {
      padding: `${vars.space.md} ${vars.space.md} 62px`,
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

export const backLink = style({
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
    '&:active': { transform: 'translateX(-1px)' },
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
  maxWidth: '660px',
})

globalStyle(`${heroCopy} > span`, {
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
  maxWidth: '52ch',
  margin: `${vars.space.md} 0 0`,
  color: vars.color.surface,
  opacity: 0.66,
  fontSize: vars.fontSize.lg,
  lineHeight: 1.65,
  textWrap: 'pretty',
})

export const serviceBadge = style({
  minWidth: 152,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: `${vars.space.sm} ${vars.space.md}`,
  border: `1px solid color-mix(in oklch, ${vars.color.surface} 14%, transparent)`,
  borderRadius: vars.radius.md,
  background: `color-mix(in oklch, ${vars.color.surface} 5%, transparent)`,
})

globalStyle(`${serviceBadge} > span:last-child`, {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
})

globalStyle(`${serviceBadge} small`, {
  color: vars.color.surface,
  opacity: 0.45,
  fontSize: vars.fontSize.xs,
})

globalStyle(`${serviceBadge} strong`, {
  color: vars.color.surface,
  fontSize: vars.fontSize.sm,
  fontWeight: 650,
})

const serviceDot = style({
  width: 9,
  height: 9,
  flexShrink: 0,
  borderRadius: vars.radius.full,
})

export const serviceDotPending = style([serviceDot, { background: vars.color.warning }])
export const serviceDotError = style([serviceDot, { background: vars.color.danger }])
export const serviceDotEnabled = style([serviceDot, { background: vars.color.success }])
export const serviceDotDisabled = style([serviceDot, { background: vars.color.textSecondary }])

export const workbenchStage = style({
  position: 'relative',
  zIndex: 2,
  margin: '-42px 24px 0',
  '@media': {
    'screen and (max-width: 720px)': { margin: '-34px 12px 0' },
    'screen and (max-width: 480px)': { margin: '-28px 0 0' },
  },
})

export const workbench = style({
  overflow: 'hidden',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  background: vars.color.surface,
  boxShadow: `0 -8px 28px oklch(0.18 0.03 258 / 0.08)`,
})

export const visuallyHidden = style({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
})

export const dropZone = style({
  minHeight: 244,
  margin: vars.space.lg,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: vars.space.xl,
  padding: `${vars.space.xl} 48px`,
  border: `1px dashed ${vars.color.borderStrong}`,
  borderRadius: vars.radius.md,
  background: vars.color.background,
  textAlign: 'left',
  cursor: 'pointer',
  transition: `border-color ${vars.motion.base} ${vars.motion.ease}, background-color ${vars.motion.base} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      borderColor: vars.color.primary,
      background: vars.color.primarySubtle,
    },
  },
  '@media': {
    'screen and (max-width: 640px)': {
      minHeight: 248,
      gridTemplateColumns: '1fr',
      margin: vars.space.md,
      gap: vars.space.lg,
      padding: `${vars.space.xl} ${vars.space.md}`,
    },
  },
})

export const dropZoneActive = style([
  dropZone,
  {
    borderColor: vars.color.primary,
    background: vars.color.primarySubtle,
  },
])

export const uploadIcon = style({
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

export const dropAction = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.lg,
  minWidth: 0,
  '@media': {
    'screen and (max-width: 480px)': {
      alignItems: 'flex-start',
      flexDirection: 'column',
      gap: vars.space.md,
    },
  },
})

globalStyle(`${dropAction} h2`, {
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.xxl,
  fontWeight: 650,
  lineHeight: 1.35,
})

globalStyle(`${dropAction} p`, {
  margin: `${vars.space.sm} 0 0`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  lineHeight: 1.5,
})

export const dropMeta = style({
  minWidth: 190,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  paddingLeft: vars.space.lg,
  borderLeft: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.4,
  '@media': {
    'screen and (max-width: 640px)': {
      minWidth: 0,
      paddingLeft: 0,
      paddingTop: vars.space.md,
      borderLeft: 0,
      borderTop: `1px solid ${vars.color.border}`,
    },
  },
})

export const results = style({
  borderTop: `1px solid ${vars.color.border}`,
})

export const resultsHeader = style({
  minHeight: 88,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.lg,
  padding: `${vars.space.md} ${vars.space.lg}`,
  '@media': {
    'screen and (max-width: 720px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
      gap: vars.space.md,
      padding: vars.space.md,
    },
  },
})

globalStyle(`${resultsHeader} h2`, {
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.xl,
  fontWeight: 650,
  lineHeight: 1.35,
})

globalStyle(`${resultsHeader} p`, {
  margin: vars.space.xs + ' 0 0',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.45,
})

export const resultActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
})

const actionButton = style({
  minHeight: 40,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
  padding: `0 ${vars.space.md}`,
  borderRadius: vars.radius.md,
  fontSize: vars.fontSize.sm,
  fontWeight: 650,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:active:not(:disabled)': { transform: 'translateY(1px)' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.45 },
  },
  '@media': {
    '(pointer: coarse)': { minHeight: 44 },
  },
})

export const secondaryButton = style([
  actionButton,
  {
    border: `1px solid ${vars.color.border}`,
    background: vars.color.surface,
    color: vars.color.text,
    selectors: {
      '&:hover:not(:disabled)': { borderColor: vars.color.borderStrong, background: vars.color.surfaceHover },
    },
  },
])

export const primaryButton = style([
  actionButton,
  {
    border: `1px solid ${vars.color.primary}`,
    background: vars.color.primary,
    color: vars.color.textOnPrimary,
    selectors: {
      '&:hover:not(:disabled)': { borderColor: vars.color.primaryHover, background: vars.color.primaryHover },
    },
  },
])

export const resultList = style({
  padding: `0 ${vars.space.lg}`,
  '@media': {
    'screen and (max-width: 720px)': { padding: `0 ${vars.space.md}` },
  },
})

export const copyError = style({
  margin: `0 ${vars.space.lg} ${vars.space.md}`,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: vars.color.dangerSubtle,
  color: vars.color.danger,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.5,
  '@media': {
    'screen and (max-width: 720px)': { margin: `0 ${vars.space.md} ${vars.space.md}` },
  },
})

export const resultItem = style({
  padding: `${vars.space.lg} 0`,
  borderTop: `1px solid ${vars.color.border}`,
})

export const resultSummary = style({
  display: 'grid',
  gridTemplateColumns: '72px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: vars.space.md,
  '@media': {
    'screen and (max-width: 600px)': {
      gridTemplateColumns: '64px minmax(0, 1fr)',
    },
  },
})

export const preview = style({
  width: 72,
  height: 60,
  display: 'block',
  objectFit: 'cover',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.background,
  '@media': {
    'screen and (max-width: 600px)': { width: 64, height: 56 },
  },
})

export const previewPlaceholder = style({
  width: 72,
  height: 60,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  background: vars.color.background,
  color: vars.color.textSecondary,
  '@media': {
    'screen and (max-width: 600px)': { width: 64, height: 56 },
  },
})

export const fileMeta = style({
  minWidth: 0,
})

globalStyle(`${fileMeta} h3`, {
  overflow: 'hidden',
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.md,
  fontWeight: 650,
  lineHeight: 1.4,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

globalStyle(`${fileMeta} p`, {
  margin: vars.space.xs + ' 0 0',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  fontVariantNumeric: 'tabular-nums',
})

const statusText = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  marginTop: vars.space.sm,
  fontSize: vars.fontSize.xs,
  fontWeight: 650,
  lineHeight: 1.4,
})

export const statusUploading = style([statusText, { color: vars.color.primary }])
export const statusSuccess = style([statusText, { color: vars.color.success }])
export const statusError = style([statusText, { color: vars.color.danger }])

export const spinner = style({
  width: 13,
  height: 13,
  border: `2px solid ${vars.color.primarySubtle}`,
  borderTopColor: vars.color.primary,
  borderRadius: vars.radius.full,
  animation: `${spin} 800ms linear infinite`,
})

export const previewLink = style({
  minHeight: 40,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: `0 ${vars.space.sm}`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  transition: `color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { color: vars.color.primary },
  },
  '@media': {
    'screen and (max-width: 600px)': {
      gridColumn: '1 / -1',
      width: 'fit-content',
      marginLeft: 80,
    },
  },
})

export const progressTrack = style({
  height: 3,
  marginTop: vars.space.md,
  overflow: 'hidden',
  borderRadius: vars.radius.full,
  background: vars.color.primarySubtle,
})

globalStyle(`${progressTrack} span`, {
  width: '28%',
  height: '100%',
  display: 'block',
  borderRadius: vars.radius.full,
  background: vars.color.primary,
  animation: `${progress} 1.2s ease-in-out infinite`,
})

export const linkGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: vars.space.md,
  marginTop: vars.space.lg,
  paddingLeft: 88,
  '@media': {
    'screen and (max-width: 820px)': {
      gridTemplateColumns: '1fr',
      paddingLeft: 0,
    },
  },
})

export const linkField = style({
  minWidth: 0,
})

globalStyle(`${linkField} label`, {
  display: 'block',
  marginBottom: '6px',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  fontWeight: 650,
})

export const linkControl = style({
  minWidth: 0,
  display: 'flex',
  overflow: 'hidden',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  background: vars.color.background,
  selectors: {
    '&:focus-within': { borderColor: vars.color.primary },
  },
})

globalStyle(`${linkControl} input`, {
  minWidth: 0,
  width: '100%',
  height: 40,
  padding: `0 ${vars.space.sm}`,
  border: 0,
  outline: 0,
  background: 'transparent',
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
})

export const copyButton = style({
  minWidth: 74,
  height: 40,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  flexShrink: 0,
  padding: `0 ${vars.space.sm}`,
  border: 0,
  borderLeft: `1px solid ${vars.color.border}`,
  background: vars.color.surface,
  color: vars.color.primary,
  fontSize: vars.fontSize.xs,
  fontWeight: 650,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { background: vars.color.primarySubtle },
  },
  '@media': {
    '(pointer: coarse)': { height: 44 },
  },
})

export const copyButtonSuccess = style([
  copyButton,
  {
    background: vars.color.successSubtle,
    color: vars.color.success,
    selectors: {
      '&:hover': { background: vars.color.successSubtle },
    },
  },
])

export const serviceState = style({
  minHeight: 220,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.lg,
  padding: vars.space.xl,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  background: vars.color.surface,
  boxShadow: vars.shadow.sm,
  '@media': {
    'screen and (max-width: 560px)': {
      alignItems: 'flex-start',
      flexDirection: 'column',
      padding: vars.space.lg,
    },
  },
})

export const serviceIcon = style({
  width: 52,
  height: 52,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: vars.radius.tile,
  background: vars.color.primarySubtle,
  color: vars.color.primary,
})

globalStyle(`${serviceState} h2`, {
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.xl,
  fontWeight: 650,
})

globalStyle(`${serviceState} p`, {
  margin: `${vars.space.sm} 0 0`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  lineHeight: 1.55,
})

globalStyle(`${serviceState} button`, {
  minHeight: 40,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `0 ${vars.space.md}`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  background: vars.color.surface,
  color: vars.color.text,
  fontWeight: 650,
  cursor: 'pointer',
})

export const loadingState = style({
  minHeight: 288,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.md,
})

export const loadingLineWide = style({
  width: 240,
  height: 18,
  borderRadius: vars.radius.sm,
  background: vars.color.surfaceHover,
})

export const loadingLine = style({
  width: 160,
  height: 12,
  borderRadius: vars.radius.sm,
  background: vars.color.surfaceHover,
})

export const privacyNote = style({
  margin: `${vars.space.lg} auto 0`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  lineHeight: 1.5,
  textAlign: 'center',
})

export const srStatus = style({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
})
