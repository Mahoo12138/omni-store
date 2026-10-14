import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const workbench = style({
  minWidth: 0,
})
export const form = style({ display: 'grid', gap: vars.space.lg, minWidth: 0 })
export const sectionHeading = style({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: vars.space.sm })
globalStyle(`${sectionHeading} h2`, { margin: 0, fontSize: vars.fontSize.lg, fontWeight: 600, lineHeight: 1.5 })
export const hint = style({ margin: 0, color: vars.color.textSecondary, fontSize: vars.fontSize.sm, lineHeight: 1.65, overflowWrap: 'anywhere' })
export const summary = style({ display: 'flex', flexWrap: 'wrap', gap: `${vars.space.sm} ${vars.space.lg}`, fontSize: vars.fontSize.sm, lineHeight: 1.6, overflowWrap: 'anywhere' })
export const uploadSection = style({ display: 'grid', gap: vars.space.md, minWidth: 0 })
export const dropZone = style({
  minHeight: 240,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: vars.space.md, padding: vars.space.lg, textAlign: 'center',
  border: `1px dashed ${vars.color.borderStrong}`, borderRadius: vars.radius.md,
  background: vars.color.background,
  selectors: {
    '&[data-dragging="true"]': { borderColor: vars.color.primary, background: vars.color.primarySubtle },
    '&[aria-disabled="true"]': { opacity: 0.65 },
  },
  '@media': { 'screen and (max-width: 400px)': { minHeight: 210, padding: vars.space.md } },
})
export const uploadIcon = style({ color: vars.color.primary, display: 'inline-flex' })
export const dropTitle = style({ margin: 0, fontSize: vars.fontSize.xl, lineHeight: 1.45, fontWeight: 600, textWrap: 'balance' })
export const pickerActions = style({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: vars.space.sm })
globalStyle(`${pickerActions} button`, { minHeight: 44 })
export const hiddenInput = style({ display: 'none' })
export const fileList = style({ listStyle: 'none', padding: 0, margin: 0, display: 'grid', minWidth: 0 })
export const fileRow = style({
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center',
  gap: vars.space.md, minWidth: 0, padding: `${vars.space.md} 0`, borderBottom: `1px solid ${vars.color.border}`,
  '@media': { 'screen and (max-width: 480px)': { gap: vars.space.sm } },
})
export const fileDetails = style({ display: 'grid', gap: vars.space.xs, minWidth: 0 })
export const filePath = style({ color: vars.color.text, fontSize: vars.fontSize.sm, lineHeight: 1.5, overflowWrap: 'anywhere' })
export const fileSize = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.sm, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' })
export const removeButton = style({
  appearance: 'none', width: 44, height: 44, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 0, borderRadius: vars.radius.sm, background: 'transparent', color: vars.color.textSecondary, cursor: 'pointer',
  selectors: {
    '&:hover': { background: vars.color.dangerSubtle, color: vars.color.danger },
    '&:focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
    '&:disabled': { opacity: 0.5, cursor: 'default' },
  },
})
export const fields = style({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: vars.space.lg, '@media': { 'screen and (max-width: 640px)': { gridTemplateColumns: 'minmax(0, 1fr)' } } })
export const noteField = style({ display: 'grid', gap: vars.space.sm, minWidth: 0 })
export const label = style({ fontSize: vars.fontSize.sm, fontWeight: 500, color: vars.color.text })
export const textarea = style({
  width: '100%', minHeight: 96, resize: 'vertical', boxSizing: 'border-box', padding: vars.space.md,
  border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.md,
  background: vars.color.surface, color: vars.color.text, font: 'inherit', fontSize: vars.fontSize.md, lineHeight: 1.6,
  selectors: { '&:focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 }, '&:disabled': { opacity: 0.6 } },
})
export const footer = style({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: vars.space.md, flexWrap: 'wrap', '@media': { 'screen and (max-width: 480px)': { flexDirection: 'column', alignItems: 'stretch' } } })
globalStyle(`${footer} button`, { minHeight: 44 })
export const error = style({ margin: 0, color: vars.color.danger, fontSize: vars.fontSize.sm, lineHeight: 1.6, overflowWrap: 'anywhere' })
export const auth = style({ maxWidth: 460, margin: '0 auto', padding: `${vars.space.xl} 0`, display: 'grid', gap: vars.space.lg })
export const authHeader = style({ display: 'grid', gap: vars.space.sm })
globalStyle(`${authHeader} h2`, { margin: 0, fontSize: vars.fontSize.xl, lineHeight: 1.5 })
export const authIcon = style({ color: vars.color.primary, display: 'inline-flex', marginBottom: vars.space.sm })
export const state = style({ minHeight: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: vars.space.md, textAlign: 'center', overflowWrap: 'anywhere' })
globalStyle(`${state} h2`, { margin: 0, fontSize: vars.fontSize.xxl, lineHeight: 1.4, textWrap: 'balance' })
globalStyle(`${state} p`, { margin: 0, maxWidth: '56ch', color: vars.color.textSecondary, fontSize: vars.fontSize.md, lineHeight: 1.7 })
export const toolbar = style({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: vars.space.md, flexWrap: 'wrap', marginBottom: vars.space.lg })
globalStyle(`${toolbar} h2`, { margin: 0, fontSize: vars.fontSize.lg, lineHeight: 1.5 })
globalStyle(`${toolbar} button`, { minHeight: 44 })
export const downloadRow = style([fileRow, { gridTemplateColumns: 'minmax(0, 1fr) auto', '@media': { 'screen and (max-width: 480px)': { alignItems: 'start' } } }])
export const downloadDetails = style({ display: 'flex', gap: vars.space.sm, alignItems: 'center', minWidth: 0 })
export const fileIcon = style({ display: 'inline-flex', flexShrink: 0, color: vars.color.primary })
