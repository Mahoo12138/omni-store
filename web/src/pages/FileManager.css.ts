import { style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  marginBottom: vars.space.md,
})

export const toolbarActions = style({
  display: 'flex',
  gap: vars.space.sm,
  flexWrap: 'wrap',
})

export const breadcrumb = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.space.xs,
  fontSize: vars.fontSize.md,
  color: vars.color.textSecondary,
})

export const crumbLink = style({
  color: vars.color.primary,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
})

export const tableWrap = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  overflowX: 'auto',
})

export const table = style({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: vars.fontSize.md,
})

export const th = style({
  textAlign: 'left',
  padding: `${vars.space.sm} ${vars.space.md}`,
  color: vars.color.textSecondary,
  fontWeight: 500,
  fontSize: vars.fontSize.sm,
  borderBottom: `1px solid ${vars.color.border}`,
})

export const td = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.border}`,
  whiteSpace: 'nowrap',
})

export const nameCell = style([
  td,
  {
    whiteSpace: 'normal',
    wordBreak: 'break-all',
    minWidth: '200px',
  },
])

export const rowLink = style({
  color: vars.color.text,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  textAlign: 'left',
  selectors: {
    '&:hover': { color: vars.color.primary },
  },
})

export const actionBtn = style({
  background: 'none',
  border: 'none',
  color: vars.color.primary,
  cursor: 'pointer',
  fontSize: vars.fontSize.sm,
  padding: `0 ${vars.space.xs}`,
  fontFamily: vars.font.body,
})

export const actionBtnDanger = style([
  actionBtn,
  {
    color: vars.color.danger,
  },
])

export const empty = style({
  padding: vars.space.xl,
  textAlign: 'center',
  color: vars.color.textSecondary,
})

export const pager = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: vars.space.sm,
  marginTop: vars.space.md,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
})

export const muted = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

export const pageTitle = style({
  fontSize: vars.fontSize.xl,
  fontWeight: 600,
  margin: 0,
  marginBottom: vars.space.md,
})

export const cardGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: vars.space.md,
})

export const sourceCard = style({
  display: 'block',
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.lg,
  color: vars.color.text,
  textDecoration: 'none',
  boxShadow: vars.shadow.sm,
  selectors: {
    '&:hover': { borderColor: vars.color.primary },
  },
})

export const sourceCardTitle = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  marginBottom: vars.space.xs,
})
