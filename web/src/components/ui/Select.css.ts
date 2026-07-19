import { globalStyle, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const trigger = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minWidth: 0,
  padding: `0 ${vars.space.md}`,
  gap: vars.space.sm,
  color: vars.color.text,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  outline: 'none',
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.md,
  lineHeight: 1,
  cursor: 'pointer',
  transition: [
    `border-color ${vars.motion.fast} ${vars.motion.ease}`,
    `background-color ${vars.motion.fast} ${vars.motion.ease}`,
    `box-shadow ${vars.motion.fast} ${vars.motion.ease}`,
  ].join(', '),
  selectors: {
    '&:hover:not([data-disabled])': {
      borderColor: vars.color.borderStrong,
      backgroundColor: vars.color.surfaceHover,
    },
    '&:focus-visible': {
      borderColor: vars.color.primary,
      boxShadow: `0 0 0 3px ${vars.color.primarySubtle}`,
    },
    '&[data-popup-open]': {
      borderColor: vars.color.primary,
      backgroundColor: vars.color.surface,
    },
    '&[data-disabled]': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
})

export const triggerWidth = styleVariants({
  full: { width: '100%' },
  content: { width: 'max-content', minWidth: 118 },
  wide: { width: 'max-content', minWidth: 190 },
})

export const triggerSize = styleVariants({
  compact: {
    height: 32,
    padding: `0 ${vars.space.sm}`,
    fontSize: vars.fontSize.sm,
  },
  default: { height: 36 },
  large: {
    height: 52,
    padding: `0 ${vars.space.sm}`,
    fontSize: vars.fontSize.sm,
    fontWeight: 600,
  },
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

export const value = style({
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'left',
})

export const placeholder = style({ color: vars.color.textSecondary })

export const icon = style({
  display: 'inline-flex',
  flexShrink: 0,
  color: vars.color.textSecondary,
  transition: `transform ${vars.motion.fast} ${vars.motion.ease}`,
})

globalStyle(`${trigger}[data-popup-open] ${icon}`, {
  transform: 'rotate(180deg)',
})

export const positioner = style({
  zIndex: vars.zIndex.toast,
  outline: 'none',
})

export const popup = style({
  minWidth: 'max(var(--anchor-width), 160px)',
  maxWidth: 'min(360px, calc(100vw - 16px))',
  maxHeight: 'min(320px, var(--available-height))',
  padding: vars.space.xs,
  overflow: 'hidden',
  color: vars.color.text,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.md,
  transformOrigin: 'var(--transform-origin)',
  transition: [
    `opacity ${vars.motion.fast} ${vars.motion.ease}`,
    `transform ${vars.motion.fast} ${vars.motion.ease}`,
  ].join(', '),
  selectors: {
    '&[data-starting-style], &[data-ending-style]': {
      opacity: 0,
      transform: 'translateY(-3px) scale(0.98)',
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
})

export const list = style({
  maxHeight: 'inherit',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  outline: 'none',
  scrollbarWidth: 'thin',
})

export const item = style({
  minHeight: 36,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 18px',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `7px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  outline: 'none',
  fontSize: vars.fontSize.sm,
  lineHeight: 1.35,
  cursor: 'pointer',
  userSelect: 'none',
  transition: [
    `color ${vars.motion.fast} ${vars.motion.ease}`,
    `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  ].join(', '),
  selectors: {
    '&[data-highlighted]': {
      backgroundColor: vars.color.surfaceHover,
    },
    '&[data-selected]': {
      color: vars.color.primarySubtleInk,
      backgroundColor: vars.color.primarySubtle,
      fontWeight: 600,
    },
    '&[data-disabled]': {
      opacity: 0.45,
      cursor: 'not-allowed',
    },
  },
})

export const itemText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const itemIndicator = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.primary,
})
