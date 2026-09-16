import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const trigger = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
})

export const popup = style({
  minWidth: '176px',
  padding: vars.space.xs,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.surface,
  boxShadow: vars.shadow.md,
  color: vars.color.text,
  outline: 'none',
  zIndex: vars.zIndex.dropdown,
})

const itemBase = style({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  minHeight: '34px',
  gap: vars.space.sm,
  padding: `6px ${vars.space.sm}`,
  border: 0,
  borderRadius: vars.radius.sm,
  background: 'transparent',
  color: vars.color.text,
  font: 'inherit',
  fontSize: vars.fontSize.sm,
  textAlign: 'left',
  cursor: 'pointer',
  selectors: {
    '&[data-highlighted]': {
      backgroundColor: vars.color.surfaceHover,
    },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.primary}`,
      outlineOffset: '-2px',
    },
    '&[data-disabled]': {
      opacity: 0.45,
      cursor: 'not-allowed',
    },
  },
})

export const item = itemBase

export const itemDanger = style([
  itemBase,
  {
    color: vars.color.danger,
    selectors: {
      '&[data-highlighted]': {
        backgroundColor: vars.color.dangerSubtle,
      },
    },
  },
])

export const itemIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  flexShrink: 0,
})

export const itemLabel = style({
  minWidth: 0,
  flex: 1,
})

export const itemSuffix = style({
  display: 'inline-flex',
  alignItems: 'center',
  marginLeft: 'auto',
})
