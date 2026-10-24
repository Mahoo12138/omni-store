import { globalStyle, style } from '@vanilla-extract/css'
import { outlineList, outlineTab } from '../ui/Tabs.css'
import { vars } from '../../styles/theme.css'

export const workspace = style({
  minWidth: 0, padding: '0 32px 36px', background: vars.color.surface, border: `1px solid ${vars.color.border}`, borderRadius: 20,
  '@media': { 'screen and (max-width: 640px)': { padding: '0 18px 24px', borderRadius: vars.radius.lg } },
})
export const publicWorkspace = style({ display: 'grid', gap: vars.space.lg, minWidth: 0 })
export const publicTabs = style([outlineList, { marginBottom: vars.space.xl }])
export const publicTab = style([outlineTab, { minHeight: 44 }])
export const tabs = style({
  display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0, margin: '0 -32px 32px', borderBottom: `1px solid ${vars.color.border}`,
  '@media': { 'screen and (max-width: 640px)': { margin: '0 -18px 24px' } },
})
export const tab = style({
  appearance: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: vars.space.xs,
  minHeight: 58, padding: '0 12px', border: 0, borderBottom: '2px solid transparent', borderRadius: 0,
  background: 'transparent', color: vars.color.textSecondary, font: 'inherit', fontSize: vars.fontSize.md, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover:not(:disabled)': { backgroundColor: vars.color.surfaceHover, color: vars.color.text },
    '&:focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: -2 },
    '&:disabled': { opacity: .45, cursor: 'not-allowed' },
  },
})
globalStyle(`${tab}[data-active], ${tab}[aria-selected="true"], ${tab}[aria-pressed="true"]`, {
  borderBottomColor: vars.color.primary, backgroundColor: vars.color.primarySubtle, color: vars.color.primarySubtleInk, fontWeight: 600,
})
export const panel = style({ minWidth: 0, selectors: { '&[hidden]': { display: 'none' } } })
export const stack = style({ display: 'grid', gap: 20, minWidth: 0 })
export const composer = style({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 304px)', gap: 40, alignItems: 'start', minWidth: 0, '@media': { 'screen and (max-width: 980px)': { gridTemplateColumns: 'minmax(0, 1fr)', gap: 32 } } })
export const composerIntro = style({ display: 'grid', gap: vars.space.sm, minWidth: 0 })
export const heading = style({ margin: 0, fontSize: vars.fontSize.xxl, lineHeight: 1.3, fontWeight: 650, letterSpacing: '-0.025em', overflowWrap: 'anywhere', textWrap: 'balance' })
export const subheading = style({ margin: 0, fontSize: vars.fontSize.lg, lineHeight: 1.5, fontWeight: 600, overflowWrap: 'anywhere' })
export const text = style({ margin: 0, fontSize: vars.fontSize.sm, color: vars.color.textSecondary, lineHeight: 1.7, maxWidth: '65ch', overflowWrap: 'anywhere' })
export const error = style({ margin: 0, padding: '10px 12px', borderRadius: vars.radius.sm, background: vars.color.dangerSubtle, color: vars.color.danger, fontSize: vars.fontSize.sm, lineHeight: 1.6, overflowWrap: 'anywhere' })
export const notice = style({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: vars.space.md, marginBottom: vars.space.lg, padding: vars.space.md, borderRadius: vars.radius.md, background: vars.color.primarySubtle, fontSize: vars.fontSize.sm, lineHeight: 1.6, color: vars.color.primarySubtleInk })
export const link = style([outlineTab, { minHeight: 44, whiteSpace: 'normal', textAlign: 'center' }])
export const fields = style({ display: 'grid', gap: 18, minWidth: 0, margin: 0, padding: 0, border: 0 })
export const actions = style({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: vars.space.sm })
globalStyle(`${actions} button`, { minHeight: 40, whiteSpace: 'normal', lineHeight: 1.4 })
globalStyle(`${fields} input`, { minWidth: 0, maxWidth: '100%', height: 42 })
export const settings = style({ minWidth: 0, padding: 20, background: vars.color.surface, border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.lg })
globalStyle(`${settings} summary`, { minHeight: 32, display: 'flex', alignItems: 'center', gap: vars.space.sm, cursor: 'pointer', color: vars.color.text, fontWeight: 650, fontSize: vars.fontSize.md, listStyle: 'none' })
globalStyle(`${settings} summary::-webkit-details-marker`, { display: 'none' })
globalStyle(`${settings} summary svg`, { marginLeft: 'auto', flexShrink: 0, color: vars.color.textSecondary, transition: `transform ${vars.motion.base} ${vars.motion.ease}` })
globalStyle(`${settings}[open] summary svg`, { transform: 'rotate(180deg)' })
globalStyle(`${settings} summary:focus-visible`, { outline: `2px solid ${vars.color.primary}`, outlineOffset: 3, borderRadius: vars.radius.md })
globalStyle(`${settings}[open] summary`, { marginBottom: 20 })
export const settingTabs = style({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 20, padding: 4, borderRadius: vars.radius.md, background: vars.color.surfaceHover })
globalStyle(`${settingTabs} > button`, { minHeight: 32, flex: 1, padding: '0 8px', border: 0, background: 'transparent' })
globalStyle(`${settingTabs} > button[data-active]`, { background: vars.color.surface })
export const checkbox = style({ display: 'flex', alignItems: 'center', gap: vars.space.sm, fontSize: vars.fontSize.sm, lineHeight: 1.5, minHeight: 36, cursor: 'pointer' })
globalStyle(`${checkbox} input`, { height: 16, width: 16, flexShrink: 0, accentColor: vars.color.primary })
export const dropZone = style({
  display: 'grid', gap: 12, alignContent: 'center', minHeight: 224, padding: 28, border: `1px dashed ${vars.color.borderStrong}`, borderRadius: vars.radius.lg,
  background: `color-mix(in oklch, ${vars.color.primarySubtle} 46%, ${vars.color.surface})`, minWidth: 0,
  transition: `border-color ${vars.motion.base} ${vars.motion.ease}, background-color ${vars.motion.base} ${vars.motion.ease}`,
  selectors: { '&:hover': { borderColor: vars.color.primary }, '&:focus-within': { borderColor: vars.color.primary } },
})
export const hiddenInput = style({ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' })
export const fileList = style({ display: 'grid', gap: vars.space.sm, padding: 0, margin: 0, listStyle: 'none', minWidth: 0 })
export const fileRow = style({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: vars.space.md, padding: '12px 14px', borderRadius: vars.radius.md, background: vars.color.surfaceHover, fontSize: vars.fontSize.sm, minWidth: 0, '@media': { 'screen and (max-width: 480px)': { gridTemplateColumns: 'minmax(0, 1fr) auto', gap: vars.space.sm } } })
export const fileName = style({ minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.6 })
export const fileMeta = style({ fontSize: vars.fontSize.xs, color: vars.color.textSecondary, lineHeight: 1.6, fontVariantNumeric: 'tabular-nums' })
export const code = style({ display: 'block', padding: vars.space.md, background: vars.color.primarySubtle, color: vars.color.primarySubtleInk, border: `1px solid color-mix(in oklch, ${vars.color.primary} 18%, transparent)`, borderRadius: vars.radius.md, fontFamily: vars.font.mono, fontSize: vars.fontSize.xl, fontWeight: 600, letterSpacing: '0.12em', textAlign: 'center', overflowWrap: 'anywhere' })
export const shareURL = style({ color: vars.color.primarySubtleInk, fontSize: vars.fontSize.sm, lineHeight: 1.6, textDecoration: 'underline', textUnderlineOffset: 4, overflowWrap: 'anywhere' })
export const receipt = style({ display: 'grid', gap: vars.space.lg, maxWidth: 720, padding: '12px 0', minWidth: 0 })
export const recordList = style({ display: 'grid', gap: 12, minWidth: 0 })
export const recordRow = style({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: vars.space.lg, padding: 20, border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.lg, background: vars.color.surface, minWidth: 0, transition: `border-color ${vars.motion.base} ${vars.motion.ease}, background-color ${vars.motion.base} ${vars.motion.ease}`, selectors: { '&:hover': { borderColor: vars.color.borderStrong, backgroundColor: vars.color.surfaceHover } } })
export const recordMain = style({ display: 'grid', gap: vars.space.sm, minWidth: 0, flex: '1 1 240px' })
export const meta = style({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: vars.space.sm, fontSize: vars.fontSize.sm, color: vars.color.textSecondary, lineHeight: 1.6, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' })
export const detailHeader = style({ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: vars.space.lg, paddingBottom: vars.space.lg, borderBottom: `1px solid ${vars.color.border}` })
export const detail = style({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 288px)', gap: 32, minWidth: 0, '@media': { 'screen and (max-width: 900px)': { gridTemplateColumns: 'minmax(0, 1fr)' } } })
globalStyle(`${detail} > aside`, { padding: 20, border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.lg, alignSelf: 'start' })
export const submission = style({ display: 'grid', gap: vars.space.md, padding: 20, border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.lg, background: vars.color.surface, minWidth: 0 })
export const saveRow = style({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: vars.space.sm, minWidth: 0, '@media': { 'screen and (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr)' } } })
export const service = style({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: vars.space.sm, color: vars.color.surface, fontSize: vars.fontSize.sm })
export const serviceText = style({ display: 'grid', gap: vars.space.xs })
globalStyle(`${serviceText} small`, { color: `color-mix(in oklch, ${vars.color.surface} 72%, transparent)`, fontSize: vars.fontSize.xs })
export const serviceDot = style({ width: 8, height: 8, borderRadius: vars.radius.full, background: vars.color.borderStrong, selectors: { '&[data-enabled="true"]': { background: vars.color.success } } })
export const retry = style({ minHeight: 44, border: 0, padding: `0 ${vars.space.sm}`, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 4 })
globalStyle(`${retry}:focus-visible`, { outline: `2px solid ${vars.color.surface}`, outlineOffset: 2 })
globalStyle(`${stack} a:focus-visible`, { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 })
