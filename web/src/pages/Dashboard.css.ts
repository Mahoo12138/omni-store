import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const pageHeader = style({
  display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: vars.space.lg,
  marginBottom: 40,
  '@media': { 'screen and (max-width: 640px)': { alignItems: 'flex-start', flexDirection: 'column', marginBottom: 32 } },
})
export const headerCopy = style({ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' })
export const welcomeDate = style({ marginBottom: vars.space.sm, color: vars.color.primary, fontSize: vars.fontSize.sm, fontWeight: 600, letterSpacing: '0.025em' })
export const pageTitle = style({
  margin: 0, fontSize: 42, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.04em', color: vars.color.text,
  '@media': { 'screen and (max-width: 640px)': { fontSize: vars.fontSize.display } },
})
export const pageLead = style({ margin: `${vars.space.sm} 0 0`, maxWidth: '65ch', color: vars.color.textSecondary, fontSize: vars.fontSize.lg, lineHeight: 1.65, textWrap: 'pretty' })

export const workspace = style({
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 304px', gap: 32, alignItems: 'start',
  '@media': { 'screen and (max-width: 1180px)': { gridTemplateColumns: 'minmax(0, 1fr)', gap: vars.space.lg } },
})
export const mainCol = style({ display: 'flex', flexDirection: 'column', gap: 32, minWidth: 0 })
export const sectionHeader = style({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: vars.space.md, marginBottom: vars.space.md })
export const sectionTitle = style({ margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em', color: vars.color.text })
export const sectionMeta = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.xs, fontVariantNumeric: 'tabular-nums' })

export const cardSection = style({
  minWidth: 0,
  padding: '24px 28px 12px',
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  '@media': { 'screen and (max-width: 640px)': { padding: '20px 16px 8px' } },
})

export const sourceList = style({
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: vars.space.md, minWidth: 0,
})
export const sourceRow = style({
  width: '100%', display: 'grid', gridTemplateRows: 'auto auto auto', alignItems: 'start', gap: 18,
  minHeight: 176, padding: 20, border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.lg,
  background: vars.color.surfaceHover, color: vars.color.text, textAlign: 'left', cursor: 'pointer',
  transition: `border-color ${vars.motion.base} ${vars.motion.ease}, background-color ${vars.motion.base} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}, box-shadow ${vars.motion.base} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { borderColor: vars.color.primary, background: vars.color.surface, boxShadow: vars.shadow.sm, transform: 'translateY(-2px)' },
    '&:active': { transform: 'translateY(0)' },
  },
})
export const sourceIdentity = style({ display: 'flex', alignItems: 'center', gap: vars.space.md, minWidth: 0 })
export const sourceIcon = style({
  width: 42, height: 42, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  borderRadius: vars.radius.tile, background: vars.color.surface, color: vars.color.tileAmberFg,
  boxShadow: `inset 0 0 0 1px ${vars.color.border}`,
  transition: `transform ${vars.motion.base} ${vars.motion.ease}, color ${vars.motion.base} ${vars.motion.ease}`,
})
globalStyle(`${sourceIcon} svg`, { transition: `transform ${vars.motion.base} ${vars.motion.ease}` })
export const sourceText = style({
  display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
})
globalStyle(`${sourceText} strong`, { fontSize: vars.fontSize.lg, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
globalStyle(`${sourceText} span`, { color: vars.color.textSecondary, fontSize: vars.fontSize.sm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
export const sourceCapabilities = style({
  color: vars.color.textSecondary, fontSize: vars.fontSize.sm, lineHeight: 1.5,
})
export const openAction = style({
  display: 'inline-flex', alignItems: 'center', gap: 4, color: vars.color.primary, fontSize: vars.fontSize.sm, fontWeight: 600,
})
globalStyle(`${openAction} svg`, { transition: `transform ${vars.motion.base} ${vars.motion.ease}` })
globalStyle(`${sourceRow}:hover ${sourceIcon}`, { transform: 'translateY(-1px)', color: vars.color.tileAmberFg })
globalStyle(`${sourceRow}:hover ${sourceIcon} svg`, { transform: 'translateY(-1px) scale(1.04)' })
globalStyle(`${sourceRow}:hover ${openAction} svg`, { transform: 'translateX(3px)' })

const pulse = keyframes({ '0%, 100%': { opacity: .45 }, '50%': { opacity: .8 } })
const skeletonBase = { background: vars.color.border, animation: `${pulse} 1.25s ease-in-out infinite` }
export const sourceSkeleton = style({
  minHeight: 176, display: 'grid', gridTemplateColumns: '42px minmax(0, 1fr)', gridTemplateRows: 'auto auto', alignItems: 'start', gap: 20,
  padding: 20, border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.lg, background: vars.color.surfaceHover,
})
export const skeletonIcon = style({ ...skeletonBase, width: 42, height: 42, borderRadius: vars.radius.tile })
export const skeletonText = style({ display: 'flex', flexDirection: 'column', gap: vars.space.sm })
globalStyle(`${skeletonText} i`, { ...skeletonBase, display: 'block', height: 10, borderRadius: vars.radius.sm })
globalStyle(`${skeletonText} i:first-child`, { width: '44%', minWidth: 96 })
globalStyle(`${skeletonText} i:last-child`, { width: '68%', minWidth: 140 })
export const skeletonMeta = style({ ...skeletonBase, gridColumn: '1 / -1', width: 120, height: 10, borderRadius: vars.radius.sm })
export const inlineState = style({
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: vars.space.md,
  padding: `${vars.space.lg} ${vars.space.md}`, borderTop: `1px solid ${vars.color.border}`, borderBottom: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  '@media': { 'screen and (max-width: 560px)': { alignItems: 'flex-start', flexDirection: 'column' } },
})
globalStyle(`${inlineState} > div`, { display: 'flex', flexDirection: 'column', gap: vars.space.xs })
globalStyle(`${inlineState} strong`, { color: vars.color.text })

export const emptyState = style({
  display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', alignItems: 'center', gap: vars.space.md,
  padding: `${vars.space.lg} ${vars.space.md}`, borderTop: `1px solid ${vars.color.border}`, borderBottom: `1px solid ${vars.color.border}`,
  '@media': { 'screen and (max-width: 640px)': { gridTemplateColumns: 'auto 1fr' } },
})
globalStyle(`${emptyState} h3`, { margin: 0, fontSize: vars.fontSize.lg, fontWeight: 600 })
globalStyle(`${emptyState} p`, { margin: '5px 0 0', color: vars.color.textSecondary, lineHeight: 1.5 })
globalStyle(`${emptyState} a`, { '@media': { 'screen and (max-width: 640px)': { gridColumn: '2' } } })
export const emptyIcon = style({
  width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: vars.radius.tile, background: vars.color.tileAmberBg, color: vars.color.tileAmberFg,
})

export const utilityRail = style({
  display: 'flex', flexDirection: 'column', gap: vars.space.lg,
  position: 'sticky', top: 32,
  '@media': { 'screen and (max-width: 1180px)': { position: 'static', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, 'screen and (max-width: 680px)': { gridTemplateColumns: '1fr' } },
})
export const utilitySection = style({
  padding: '22px 22px 24px',
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  '@media': { 'screen and (max-width: 640px)': { padding: '20px 16px' } },
})
export const utilityTitle = style({ margin: 0, fontSize: vars.fontSize.lg, fontWeight: 650, letterSpacing: '-0.015em', color: vars.color.text })
export const quickActions = style({ display: 'flex', flexDirection: 'column', gap: vars.space.sm, marginTop: vars.space.md })
export const quickAction = style({
  display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) auto', alignItems: 'center', gap: 12,
  width: '100%', minHeight: 68, padding: 12, border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.md,
  background: vars.color.surface, color: vars.color.text, textAlign: 'left', cursor: 'pointer',
  transition: `border-color ${vars.motion.base} ${vars.motion.ease}, background-color ${vars.motion.base} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover:not(:disabled)': { borderColor: vars.color.primary, backgroundColor: vars.color.primarySubtle },
    '&:active:not(:disabled)': { transform: 'translateY(1px)' },
    '&:disabled': { opacity: .5, cursor: 'not-allowed' },
  },
})
globalStyle(`${quickAction} strong`, { display: 'block', fontSize: vars.fontSize.sm, fontWeight: 600 })
globalStyle(`${quickAction} small`, { display: 'block', marginTop: 3, color: vars.color.textSecondary, fontSize: vars.fontSize.xs })
export const quickIcon = style({
  width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: vars.radius.md, background: vars.color.primarySubtle, color: vars.color.primary,
  transition: `transform ${vars.motion.base} ${vars.motion.ease}, background-color ${vars.motion.base} ${vars.motion.ease}`,
})
export const quickArrow = style({
  display: 'inline-flex', color: vars.color.textSecondary,
  transition: `transform ${vars.motion.base} ${vars.motion.ease}, color ${vars.motion.base} ${vars.motion.ease}`,
})
globalStyle(`${quickAction}:hover:not(:disabled) ${quickIcon}`, { transform: 'translateY(-1px)', background: vars.color.primarySubtle })
globalStyle(`${quickAction}:hover:not(:disabled) ${quickArrow}`, { transform: 'translateX(3px)', color: vars.color.primary })

export const statusSection = style({
  padding: '22px 22px 24px',
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  '@media': { 'screen and (max-width: 640px)': { padding: '20px 16px' } },
})
export const statusHeader = style({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: vars.space.sm })
export const running = style({ display: 'inline-flex', alignItems: 'center', gap: 6, color: vars.color.success, fontSize: vars.fontSize.xs })
globalStyle(`${running} i`, { width: 7, height: 7, borderRadius: '50%', background: vars.color.success })
const confirmReady = keyframes({
  '0%': { opacity: 0, transform: 'scale(0.7)' },
  '55%': { opacity: 1, transform: 'scale(1.08)' },
  '100%': { opacity: 1, transform: 'scale(1)' },
})
export const runningReady = style([
  running,
  { fontWeight: 600 },
])
globalStyle(`${runningReady} svg`, { animation: `${confirmReady} 420ms ${vars.motion.ease} both` })
export const statusList = style({ display: 'flex', flexDirection: 'column', marginTop: vars.space.sm })
export const statusRow = style({ display: 'flex', justifyContent: 'space-between', gap: vars.space.md, padding: '10px 0', borderBottom: `1px solid ${vars.color.border}`, color: vars.color.textSecondary, fontSize: vars.fontSize.sm })
globalStyle(`${statusRow}:last-child`, { borderBottom: 0 })
globalStyle(`${statusRow} > span:last-child`, { display: 'inline-flex', alignItems: 'center', gap: 7 })
export const dotOn = style({ width: 7, height: 7, borderRadius: '50%', background: vars.color.success })
export const dotOff = style({ width: 7, height: 7, borderRadius: '50%', background: vars.color.borderStrong })
export const statusSkeleton = style({ display: 'flex', flexDirection: 'column', gap: 12, marginTop: vars.space.md })
globalStyle(`${statusSkeleton} i`, { ...skeletonBase, display: 'block', width: '100%', height: 12, borderRadius: vars.radius.sm })
export const compactError = style({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: vars.space.sm, marginTop: vars.space.md, color: vars.color.textSecondary, fontSize: vars.fontSize.sm })
globalStyle(`${compactError} button`, {
  padding: `${vars.space.xs} ${vars.space.sm}`, border: 0, borderRadius: vars.radius.sm, background: 'transparent',
  color: vars.color.primary, fontWeight: 600, cursor: 'pointer',
})
globalStyle(`${compactError} button:hover`, { background: vars.color.primarySubtle })

export const activitySection = style({
  minWidth: 0,
  padding: '24px 28px 12px',
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  '@media': { 'screen and (max-width: 640px)': { padding: '20px 16px 8px' } },
})
export const activityList = style({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: vars.space.md, minWidth: 0 })
export const activityRow = style({
  display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', alignItems: 'start', gap: 12,
  minHeight: 88, padding: 16, borderRadius: vars.radius.lg, background: vars.color.surfaceHover,
  transition: `background-color ${vars.motion.base} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: { '&:hover': { backgroundColor: vars.color.primarySubtle, transform: 'translateY(-1px)' } },
})
globalStyle(`${activityRow} time`, {
  color: vars.color.textSecondary, fontSize: vars.fontSize.xs, fontVariantNumeric: 'tabular-nums',
  '@media': { 'screen and (max-width: 480px)': { gridColumn: 2 } },
})
export const activityIcon = style({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32,
  borderRadius: vars.radius.md, background: vars.color.surface, color: vars.color.primary,
})
export const activityBody = style({ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 })
globalStyle(`${activityBody} strong`, { fontSize: vars.fontSize.sm, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
globalStyle(`${activityBody} small`, { color: vars.color.textSecondary, fontSize: vars.fontSize.xs })
export const activityEmpty = style({ padding: '24px 8px', color: vars.color.textSecondary, fontSize: vars.fontSize.sm })
export const activitySkeleton = style({
  display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) 48px', alignItems: 'start', gap: 12,
  minHeight: 88, padding: 16, borderRadius: vars.radius.lg, background: vars.color.surfaceHover,
})
globalStyle(`${activitySkeleton} > i`, { ...skeletonBase, display: 'block', width: 32, height: 32, borderRadius: vars.radius.md })
globalStyle(`${activitySkeleton} > span`, { display: 'flex', flexDirection: 'column', gap: vars.space.sm })
globalStyle(`${activitySkeleton} > span i`, { ...skeletonBase, display: 'block', height: 9, borderRadius: vars.radius.sm })
globalStyle(`${activitySkeleton} > span i:first-child`, { width: '46%', minWidth: 120 })
globalStyle(`${activitySkeleton} > span i:last-child`, { width: '30%', minWidth: 72 })
globalStyle(`${activitySkeleton} > i:last-child`, { width: 42, height: 9 })
export const textAction = style({
  minHeight: 36, display: 'inline-flex', alignItems: 'center', gap: 3, padding: `0 ${vars.space.xs}`,
  borderRadius: vars.radius.sm, color: vars.color.primary, fontSize: vars.fontSize.sm, fontWeight: 550,
  selectors: { '&:hover': { background: vars.color.primarySubtle } },
})
