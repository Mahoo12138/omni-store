import { globalStyle, style } from '@vanilla-extract/css'
import { outlineList, outlineTab } from '../../components/ui/Tabs.css'
import { vars } from '../../styles/theme.css'

export const root = style({ minWidth: 0, display: 'flex', flexDirection: 'column', gap: vars.space.md })
export const tabs = style({ minWidth: 0 })
export const tabList = style([outlineList, { marginBottom: vars.space.lg }])
export const tab = style([outlineTab, { minHeight: 44, fontSize: vars.fontSize.md }])
export const panel = style({
  display: 'flex', flexDirection: 'column', gap: vars.space.lg, minWidth: 0,
  selectors: { '&[hidden]': { display: 'none' } },
})
export const source = style({ display: 'flex', flexDirection: 'column', gap: vars.space.xs, minWidth: 0, overflowWrap: 'anywhere' })
export const path = style({ fontFamily: vars.font.mono, fontSize: vars.fontSize.xs, color: vars.color.textSecondary, overflowWrap: 'anywhere' })
export const featureGroup = style({ display: 'flex', flexDirection: 'column', gap: vars.space.sm, paddingTop: vars.space.md, borderTop: `1px solid ${vars.color.border}` })
export const featureRow = style({
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: vars.space.md, flexWrap: 'wrap',
})
export const hint = style({ margin: 0, fontSize: vars.fontSize.sm, lineHeight: 1.6, color: vars.color.textSecondary, overflowWrap: 'anywhere' })
export const error = style({ fontSize: vars.fontSize.sm, lineHeight: 1.6, color: vars.color.danger, overflowWrap: 'anywhere' })
export const message = style({ fontSize: vars.fontSize.sm, lineHeight: 1.6, color: vars.color.textSecondary, overflowWrap: 'anywhere' })
export const facts = style({ margin: 0, display: 'grid', gap: vars.space.md })
globalStyle(`${facts} > div`, {
  display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: vars.space.md,
  alignItems: 'baseline', fontSize: vars.fontSize.sm,
})
globalStyle(`${facts} dt`, { color: vars.color.textSecondary })
globalStyle(`${facts} dd`, { margin: 0, minWidth: 0, overflowWrap: 'anywhere' })
