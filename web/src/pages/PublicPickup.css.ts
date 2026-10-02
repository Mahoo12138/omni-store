import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const state = style({ minHeight: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: vars.space.sm, color: vars.color.textSecondary, textAlign: 'center' })
globalStyle(`${state} h1`, { margin: 0, color: vars.color.text, fontSize: vars.fontSize.xxl })
globalStyle(`${state} p`, { margin: 0, lineHeight: 1.6 })
export const stateIcon = style({ width: 58, height: 58, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: vars.color.primary, background: vars.color.primarySubtle, borderRadius: vars.radius.tile })

export const cardWrap = style({ minHeight: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: vars.space.lg })
export const card = style({ width: '100%', maxWidth: 420, padding: vars.space.lg, background: vars.color.surface, border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.lg, boxShadow: vars.shadow.md, textAlign: 'center' })
export const cardIcon = style({ width: 58, height: 58, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: vars.space.md, color: vars.color.primary, background: vars.color.primarySubtle, borderRadius: vars.radius.tile })
globalStyle(`${card} h1`, { margin: 0, color: vars.color.text, fontSize: vars.fontSize.xxl })
globalStyle(`${card} p`, { margin: '8px 0 20px', color: vars.color.textSecondary, lineHeight: 1.6 })
export const form = style({ display: 'grid', gap: vars.space.sm })
export const error = style({ color: vars.color.danger, fontSize: vars.fontSize.sm, textAlign: 'left' })

export const content = style({ maxWidth: 760, margin: '0 auto', padding: `${vars.space.xl} ${vars.space.lg}` })
export const header = style({ marginBottom: vars.space.lg })
globalStyle(`${header} h1`, { margin: 0, color: vars.color.text, fontSize: vars.fontSize.xxl, overflowWrap: 'anywhere' })
globalStyle(`${header} p`, { margin: '8px 0 0', color: vars.color.textSecondary, lineHeight: 1.6 })
export const toolbar = style({ display: 'flex', justifyContent: 'flex-end', marginBottom: vars.space.md })
export const fileList = style({ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: vars.space.xs })
export const fileRow = style({ display: 'flex', alignItems: 'center', gap: vars.space.md, padding: `${vars.space.sm} ${vars.space.md}`, background: vars.color.surface, border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.md })
export const filePath = style({ flex: 1, minWidth: 0, fontFamily: vars.font.mono, fontSize: vars.fontSize.sm, color: vars.color.text, overflowWrap: 'anywhere' })
export const fileSize = style({ flexShrink: 0, color: vars.color.textSecondary, fontSize: vars.fontSize.sm })
