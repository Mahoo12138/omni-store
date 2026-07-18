import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const pageHeader = style({
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: vars.space.lg,
  marginBottom: vars.space.xl,
  '@media': { 'screen and (max-width: 640px)': { alignItems: 'flex-start', flexDirection: 'column', marginBottom: '32px' } },
})
export const pageTitle = style({ margin: 0, fontSize: vars.fontSize.display, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.03em', color: vars.color.text })
export const pageLead = style({ margin: `${vars.space.sm} 0 0`, maxWidth: '70ch', color: vars.color.textSecondary, fontSize: vars.fontSize.lg, lineHeight: 1.55, textWrap: 'pretty' })

export const workspace = style({
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 288px', gap: vars.space.xl, alignItems: 'start',
  '@media': { 'screen and (max-width: 1080px)': { gridTemplateColumns: 'minmax(0, 1fr)', gap: vars.space.xl } },
})
export const mainCol = style({ display: 'flex', flexDirection: 'column', gap: vars.space.xl, minWidth: 0 })
export const sectionHeader = style({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: vars.space.md, marginBottom: vars.space.sm })
export const sectionTitle = style({ margin: 0, fontSize: vars.fontSize.md, fontWeight: 600, color: vars.color.text })
export const sectionMeta = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.xs, fontVariantNumeric: 'tabular-nums' })

export const sourceList = style({ borderTop: `1px solid ${vars.color.border}` })
export const sourceListHead = style({
  display: 'grid', gridTemplateColumns: 'minmax(220px, 1.35fr) minmax(180px, 1fr) 72px', gap: vars.space.md,
  padding: `${vars.space.sm} ${vars.space.md}`, borderBottom: `1px solid ${vars.color.border}`, color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  '@media': { 'screen and (max-width: 720px)': { display: 'none' } },
})
export const sourceRow = style({
  width: '100%', display: 'grid', gridTemplateColumns: 'minmax(220px, 1.35fr) minmax(180px, 1fr) 72px',
  minHeight: '72px', alignItems: 'center', gap: vars.space.md, padding: vars.space.md, border: 0, borderBottom: `1px solid ${vars.color.border}`,
  background: 'transparent', color: vars.color.text, textAlign: 'left', cursor: 'pointer',
  transition: `background-color ${vars.motion.base} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: { '&:hover': { backgroundColor: vars.color.surfaceHover }, '&:active': { transform: 'translateY(1px)' } },
  '@media': {
    'screen and (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr) auto', padding: `${vars.space.md} ${vars.space.sm}` },
  },
})
export const sourceIdentity = style({ display: 'flex', alignItems: 'center', gap: vars.space.md, minWidth: 0 })
export const sourceIcon = style({
  width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  borderRadius: vars.radius.tile, background: vars.color.tileAmberBg, color: vars.color.tileAmberFg,
})
export const sourceText = style({
  display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
})
globalStyle(`${sourceText} strong`, { fontSize: vars.fontSize.lg, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
globalStyle(`${sourceText} span`, { color: vars.color.textSecondary, fontSize: vars.fontSize.sm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
export const sourceCapabilities = style({
  color: vars.color.textSecondary, fontSize: vars.fontSize.sm,
  '@media': { 'screen and (max-width: 720px)': { gridColumn: 1, paddingLeft: 52, marginTop: -8 } },
})
export const openAction = style({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, color: vars.color.primary, fontSize: vars.fontSize.sm, fontWeight: 600,
  '@media': { 'screen and (max-width: 720px)': { gridColumn: 2, gridRow: '1 / span 2' } },
})

const pulse = keyframes({ '0%, 100%': { opacity: .45 }, '50%': { opacity: .8 } })
const skeletonBase = { background: vars.color.border, animation: `${pulse} 1.25s ease-in-out infinite` }
export const sourceSkeleton = style({
  minHeight: 72, display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) 120px', alignItems: 'center', gap: vars.space.md,
  padding: vars.space.md, borderBottom: `1px solid ${vars.color.border}`,
  '@media': { 'screen and (max-width: 720px)': { gridTemplateColumns: '36px minmax(0, 1fr)', padding: `${vars.space.md} ${vars.space.sm}` } },
})
export const skeletonIcon = style({ ...skeletonBase, width: 36, height: 36, borderRadius: vars.radius.tile })
export const skeletonText = style({ display: 'flex', flexDirection: 'column', gap: vars.space.sm })
globalStyle(`${skeletonText} i`, { ...skeletonBase, display: 'block', height: 10, borderRadius: vars.radius.sm })
globalStyle(`${skeletonText} i:first-child`, { width: '44%', minWidth: 96 })
globalStyle(`${skeletonText} i:last-child`, { width: '68%', minWidth: 140 })
export const skeletonMeta = style({ ...skeletonBase, width: 104, height: 10, borderRadius: vars.radius.sm, '@media': { 'screen and (max-width: 720px)': { display: 'none' } } })
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
  display: 'flex', flexDirection: 'column', gap: vars.space.lg, paddingLeft: vars.space.lg, borderLeft: `1px solid ${vars.color.border}`,
  position: 'sticky', top: '112px',
  '@media': { 'screen and (max-width: 1080px)': { position: 'static', paddingLeft: 0, borderLeft: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, 'screen and (max-width: 680px)': { gridTemplateColumns: '1fr' } },
})
export const utilitySection = style({})
export const utilityTitle = style({ margin: 0, fontSize: vars.fontSize.md, fontWeight: 650, letterSpacing: '-0.015em', color: vars.color.text })
export const quickActions = style({ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 })
export const quickAction = style({
  display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', alignItems: 'center', gap: vars.space.md,
  width: '100%', minHeight: 64, padding: vars.space.md, border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.md,
  background: vars.color.surface, color: vars.color.text, textAlign: 'left', cursor: 'pointer',
  transition: `border-color ${vars.motion.base} ${vars.motion.ease}, box-shadow ${vars.motion.base} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover:not(:disabled)': { borderColor: vars.color.borderStrong, boxShadow: vars.shadow.sm },
    '&:active:not(:disabled)': { transform: 'translateY(1px)' },
    '&:disabled': { opacity: .5, cursor: 'not-allowed' },
  },
})
globalStyle(`${quickAction} strong`, { display: 'block', fontSize: vars.fontSize.sm, fontWeight: 600 })
globalStyle(`${quickAction} small`, { display: 'block', marginTop: 3, color: vars.color.textSecondary, fontSize: vars.fontSize.xs })
export const quickIcon = style({
  width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: vars.radius.md, background: vars.color.primarySubtle, color: vars.color.primary,
})

export const statusSection = style({ paddingTop: vars.space.lg, borderTop: `1px solid ${vars.color.border}` })
export const statusHeader = style({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: vars.space.sm })
export const running = style({ display: 'inline-flex', alignItems: 'center', gap: 6, color: vars.color.success, fontSize: vars.fontSize.xs })
globalStyle(`${running} i`, { width: 7, height: 7, borderRadius: '50%', background: vars.color.success })
export const statusList = style({ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 })
export const statusRow = style({ display: 'flex', justifyContent: 'space-between', gap: vars.space.md, color: vars.color.textSecondary, fontSize: vars.fontSize.sm })
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

export const activitySection = style({})
export const activityList = style({ borderTop: `1px solid ${vars.color.border}` })
export const activityRow = style({
  display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', alignItems: 'center', gap: 12,
  minHeight: 64, padding: '12px 8px', borderBottom: `1px solid ${vars.color.border}`,
})
globalStyle(`${activityRow} time`, { color: vars.color.textSecondary, fontSize: vars.fontSize.xs, fontVariantNumeric: 'tabular-nums' })
export const activityIcon = style({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: vars.color.primary })
export const activityBody = style({ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 })
globalStyle(`${activityBody} strong`, { fontSize: vars.fontSize.sm, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
globalStyle(`${activityBody} small`, { color: vars.color.textSecondary, fontSize: vars.fontSize.xs })
export const activityEmpty = style({ padding: '24px 8px', borderTop: `1px solid ${vars.color.border}`, color: vars.color.textSecondary, fontSize: vars.fontSize.sm })
export const activitySkeleton = style({
  display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 48px', alignItems: 'center', gap: 12,
  minHeight: 64, padding: '12px 8px', borderBottom: `1px solid ${vars.color.border}`,
})
globalStyle(`${activitySkeleton} > i`, { ...skeletonBase, display: 'block', width: 20, height: 20, borderRadius: vars.radius.sm })
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
