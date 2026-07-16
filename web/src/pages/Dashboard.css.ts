import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const pageHeader = style({
  display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: vars.space.lg,
  marginBottom: '52px',
  '@media': { 'screen and (max-width: 640px)': { alignItems: 'flex-start', flexDirection: 'column', marginBottom: '36px' } },
})
export const pageTitle = style({ margin: 0, fontSize: vars.fontSize.display, lineHeight: 1.1, fontWeight: 720, letterSpacing: '-0.045em', color: vars.color.text })
export const pageLead = style({ margin: '13px 0 0', color: vars.color.textSecondary, fontSize: vars.fontSize.lg, lineHeight: 1.6 })

export const workspace = style({
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 294px', gap: '56px', alignItems: 'start',
  '@media': { 'screen and (max-width: 1080px)': { gridTemplateColumns: 'minmax(0, 1fr)', gap: '44px' } },
})
export const mainCol = style({ display: 'flex', flexDirection: 'column', gap: '52px', minWidth: 0 })
export const sectionHeader = style({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: vars.space.md, marginBottom: '14px' })
export const sectionTitle = style({ margin: 0, fontSize: vars.fontSize.sm, fontWeight: 600, letterSpacing: '0.035em', color: vars.color.text })
export const sectionMeta = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.xs, fontVariantNumeric: 'tabular-nums' })

export const sourceList = style({ borderTop: `1px solid ${vars.color.border}` })
export const sourceListHead = style({
  display: 'grid', gridTemplateColumns: 'minmax(220px, 1.35fr) minmax(180px, 1fr) 72px', gap: vars.space.md,
  padding: '11px 16px', borderBottom: `1px solid ${vars.color.border}`, color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  '@media': { 'screen and (max-width: 720px)': { display: 'none' } },
})
export const sourceRow = style({
  width: '100%', display: 'grid', gridTemplateColumns: 'minmax(220px, 1.35fr) minmax(180px, 1fr) 72px',
  alignItems: 'center', gap: vars.space.md, padding: '22px 16px', border: 0, borderBottom: `1px solid ${vars.color.border}`,
  background: 'transparent', color: vars.color.text, textAlign: 'left', cursor: 'pointer',
  transition: `background-color ${vars.motion.base} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: { '&:hover': { backgroundColor: vars.color.surfaceHover }, '&:active': { transform: 'translateY(1px)' } },
  '@media': {
    'screen and (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr) auto', padding: '18px 8px' },
  },
})
export const sourceRowHighlighted = style([sourceRow, { backgroundColor: 'oklch(0.975 0.01 250)' }])
export const sourceIdentity = style({ display: 'flex', alignItems: 'center', gap: '15px', minWidth: 0 })
export const sourceIcon = style({ color: 'oklch(0.72 0.15 82)', display: 'inline-flex', flexShrink: 0 })
export const sourceText = style({
  display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
})
globalStyle(`${sourceText} strong`, { fontSize: vars.fontSize.lg, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
globalStyle(`${sourceText} span`, { color: vars.color.textSecondary, fontSize: vars.fontSize.sm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
export const sourceCapabilities = style({
  color: vars.color.textSecondary, fontSize: vars.fontSize.sm,
  '@media': { 'screen and (max-width: 720px)': { gridColumn: 1, paddingLeft: 43, marginTop: -7 } },
})
export const openAction = style({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, color: vars.color.primary, fontSize: vars.fontSize.sm, fontWeight: 600,
  '@media': { 'screen and (max-width: 720px)': { gridColumn: 2, gridRow: '1 / span 2' } },
})

const pulse = keyframes({ '0%, 100%': { opacity: .45 }, '50%': { opacity: .8 } })
export const sourceSkeleton = style({ height: 82, borderBottom: `1px solid ${vars.color.border}`, background: vars.color.surfaceHover, animation: `${pulse} 1.25s ease-in-out infinite` })
export const inlineState = style({ display: 'flex', flexDirection: 'column', gap: 5, padding: '32px 16px', borderTop: `1px solid ${vars.color.border}`, borderBottom: `1px solid ${vars.color.border}`, color: vars.color.textSecondary })
globalStyle(`${inlineState} strong`, { color: vars.color.text })

export const emptyState = style({
  display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: vars.space.md,
  padding: '30px 16px', borderTop: `1px solid ${vars.color.border}`, borderBottom: `1px solid ${vars.color.border}`,
  '@media': { 'screen and (max-width: 640px)': { gridTemplateColumns: 'auto 1fr' } },
})
globalStyle(`${emptyState} h3`, { margin: 0, fontSize: vars.fontSize.lg, fontWeight: 600 })
globalStyle(`${emptyState} p`, { margin: '5px 0 0', color: vars.color.textSecondary, lineHeight: 1.5 })
globalStyle(`${emptyState} a`, { '@media': { 'screen and (max-width: 640px)': { gridColumn: '2' } } })
export const emptyIcon = style({ display: 'inline-flex', color: 'oklch(0.72 0.15 82)' })

export const utilityRail = style({
  display: 'flex', flexDirection: 'column', gap: '30px', paddingLeft: '30px', borderLeft: `1px solid ${vars.color.border}`,
  position: 'sticky', top: '112px',
  '@media': { 'screen and (max-width: 1080px)': { position: 'static', paddingLeft: 0, borderLeft: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, 'screen and (max-width: 680px)': { gridTemplateColumns: '1fr' } },
})
export const utilitySection = style({})
export const utilityTitle = style({ margin: 0, fontSize: vars.fontSize.md, fontWeight: 650, letterSpacing: '-0.015em', color: vars.color.text })
export const quickActions = style({ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 })
export const quickAction = style({
  display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) auto', alignItems: 'center', gap: 12,
  width: '100%', padding: '15px 14px', border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.md,
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
export const quickIcon = style({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: vars.color.primary })

export const statusSection = style({ paddingTop: 26, borderTop: `1px solid ${vars.color.border}` })
export const statusHeader = style({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: vars.space.sm })
export const running = style({ display: 'inline-flex', alignItems: 'center', gap: 6, color: vars.color.success, fontSize: vars.fontSize.xs })
globalStyle(`${running} i`, { width: 7, height: 7, borderRadius: '50%', background: vars.color.success })
export const statusList = style({ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 })
export const statusRow = style({ display: 'flex', justifyContent: 'space-between', gap: vars.space.md, color: vars.color.textSecondary, fontSize: vars.fontSize.sm })
globalStyle(`${statusRow} > span:last-child`, { display: 'inline-flex', alignItems: 'center', gap: 7 })
export const dotOn = style({ width: 7, height: 7, borderRadius: '50%', background: vars.color.success })
export const dotOff = style({ width: 7, height: 7, borderRadius: '50%', background: vars.color.borderStrong })
export const statusLoading = style({ marginTop: 18, color: vars.color.textSecondary, fontSize: vars.fontSize.sm })

export const activitySection = style({})
export const activityList = style({ borderTop: `1px solid ${vars.color.border}` })
export const activityRow = style({
  display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', alignItems: 'center', gap: 12,
  padding: '13px 8px', borderBottom: `1px solid ${vars.color.border}`,
})
globalStyle(`${activityRow} time`, { color: vars.color.textSecondary, fontSize: vars.fontSize.xs, fontVariantNumeric: 'tabular-nums' })
export const activityIcon = style({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: vars.color.primary })
export const activityBody = style({ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 })
globalStyle(`${activityBody} strong`, { fontSize: vars.fontSize.sm, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
globalStyle(`${activityBody} small`, { color: vars.color.textSecondary, fontSize: vars.fontSize.xs })
export const activityEmpty = style({ padding: '24px 8px', borderTop: `1px solid ${vars.color.border}`, color: vars.color.textSecondary, fontSize: vars.fontSize.sm })
export const textAction = style({ display: 'inline-flex', alignItems: 'center', gap: 3, color: vars.color.primary, fontSize: vars.fontSize.sm, fontWeight: 550, selectors: { '&:hover': { textDecoration: 'underline' } } })
