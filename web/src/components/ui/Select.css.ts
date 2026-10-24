import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// Fluent Dropdown 触发器内容与宽度布局（触发器/弹层本体已迁移到 Fluent Dropdown）

export const triggerWidth = styleVariants({
  full: { width: '100%' },
  content: { width: 'max-content', minWidth: 118 },
  wide: { width: 'max-content', minWidth: 190 },
})

export const leadingIcon = style({
  width: 34,
  height: 34,
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  color: vars.color.primary,
  backgroundColor: vars.color.primarySubtle,
  borderRadius: vars.radius.md,
})

export const leadingIconPlain = style({
  width: 20,
  height: 20,
  color: vars.color.textSecondary,
  backgroundColor: 'transparent',
  borderRadius: 0,
})

export const value = style({
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'left',
})

export const placeholder = style({ color: vars.color.textSecondary })
