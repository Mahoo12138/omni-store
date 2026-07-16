import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const shell = style({
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
})

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.lg,
  padding: `0 ${vars.space.lg}`,
  height: '64px',
  backgroundColor: vars.color.surface,
  borderBottom: `1px solid ${vars.color.border}`,
  position: 'sticky',
  top: 0,
  zIndex: vars.zIndex.sticky,
})

export const brand = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  color: vars.color.primary,
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  letterSpacing: '-0.01em',
})

export const brandName = style({
  color: vars.color.text,
})

export const nav = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  flex: 1,
  justifyContent: 'center',
  alignSelf: 'stretch',
})

export const navLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: '100%',
  padding: `0 ${vars.space.md}`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  fontWeight: 500,
  borderBottom: '2px solid transparent',
  marginBottom: '-1px',
  transition: `color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { color: vars.color.text },
  },
})

export const navLinkIcon = style({
  display: 'inline-flex',
  marginRight: '2px',
  color: 'inherit',
})

export const navLinkActive = style([
  navLink,
  {
    color: vars.color.primary,
    borderBottomColor: vars.color.primary,
    selectors: {
      '&:hover': { color: vars.color.primary },
    },
  },
])

export const headerCta = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '84px',
  height: '38px',
  padding: '0 14px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.primary,
  color: vars.color.textOnPrimary,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.primaryHover },
    '&:active': { backgroundColor: vars.color.primaryActive, transform: 'translateY(1px)' },
  },
})

export const authPlaceholder = style({
  width: '84px',
  height: '38px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.surfaceHover,
  flexShrink: 0,
})

export const main = style({
  flex: 1,
  width: '100%',
  maxWidth: '1240px',
  margin: '0 auto',
  padding: `${vars.space.lg} ${vars.space.lg} ${vars.space.xl}`,
})

export const breadcrumb = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '6px',
  padding: `${vars.space.md} 0`,
  fontSize: vars.fontSize.lg,
  color: vars.color.textSecondary,
})

// 面包屑首页图标（docs/index.png）：点击回到 / 。
export const crumbHome = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  marginRight: '2px',
  background: 'none',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.primarySubtle,
      color: vars.color.primary,
      borderColor: vars.color.primarySubtle,
    },
  },
})

export const crumbLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: vars.fontSize.lg,
  fontFamily: vars.font.body,
  transition: `color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { color: vars.color.primary },
  },
})

export const crumbCurrent = style({
  color: vars.color.text,
  fontWeight: 600,
})

export const crumbSep = style({
  color: vars.color.borderStrong,
})

export const crumbGroup = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
})

export const footer = style({
  padding: `${vars.space.md} 0`,
  textAlign: 'center',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
})

// 移动端：导航收紧
export const headerResponsive = style({
  '@media': {
    'screen and (max-width: 640px)': {
      gap: vars.space.sm,
      padding: `0 ${vars.space.md}`,
    },
  },
})
