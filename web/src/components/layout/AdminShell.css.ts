import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// --- 外壳：垂直堆叠（顶栏 → tabs → main） ---
export const shell = style({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  backgroundColor: vars.color.background,
})

// --- 顶栏 ---

export const topbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.lg,
  height: '60px',
  padding: `0 ${vars.space.lg}`,
  backgroundColor: vars.color.surface,
  borderBottom: `1px solid ${vars.color.border}`,
  position: 'sticky',
  top: 0,
  zIndex: vars.zIndex.sticky,
  '@media': {
    'screen and (max-width: 640px)': {
      padding: `0 ${vars.space.md}`,
      gap: vars.space.md,
    },
  },
})

export const brand = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  color: vars.color.primary,
  fontSize: vars.fontSize.lg,
  fontWeight: 700,
  textDecoration: 'none',
  flexShrink: 0,
})

export const brandName = style({
  color: vars.color.text,
  '@media': {
    'screen and (max-width: 480px)': {
      display: 'none',
    },
  },
})

export const nav = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.lg,
  flex: 1,
  marginLeft: vars.space.lg,
  '@media': {
    'screen and (max-width: 820px)': {
      gap: vars.space.md,
      marginLeft: 0,
      flex: 1,
      justifyContent: 'flex-end',
    },
  },
})

export const navLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  height: '60px',
  padding: `0 ${vars.space.md}`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  fontWeight: 500,
  textDecoration: 'none',
  borderBottom: '2px solid transparent',
  marginBottom: '-1px',
  transition: `color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { color: vars.color.text },
  },
})

export const navLinkActive = style([
  navLink,
  {
    color: vars.color.primary,
    borderBottomColor: vars.color.primary,
  },
])

export const right = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  flexShrink: 0,
})

export const userMenu = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  position: 'relative',
})

export const userMenuBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `4px ${vars.space.sm} 4px 4px`,
  background: 'none',
  border: 'none',
  borderRadius: vars.radius.full,
  cursor: 'pointer',
  fontFamily: vars.font.body,
  color: vars.color.text,
  fontSize: vars.fontSize.md,
  fontWeight: 500,
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover },
  },
})

export const userAvatar = style({
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.primarySubtle,
  color: vars.color.primary,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  flexShrink: 0,
})

export const userDropdown = style({
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  minWidth: 200,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.md,
  padding: '6px',
  zIndex: vars.zIndex.dropdown,
})

export const userDropdownItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '8px 10px',
  background: 'none',
  border: 'none',
  borderRadius: vars.radius.md,
  color: vars.color.text,
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  cursor: 'pointer',
  textAlign: 'left',
  textDecoration: 'none',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover },
  },
})

export const userDropdownDivider = style({
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '4px 0',
})

// --- 二级 tabs（管理导航） ---

export const subnav = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.lg,
  backgroundColor: vars.color.surface,
  borderBottom: `1px solid ${vars.color.border}`,
  padding: `0 ${vars.space.lg}`,
  position: 'sticky',
  top: '60px',
  zIndex: String(Number(vars.zIndex.sticky) - 1),
  overflowX: 'auto',
  '@media': {
    'screen and (max-width: 640px)': {
      padding: `0 ${vars.space.md}`,
      gap: vars.space.md,
    },
  },
})

export const subnavLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  height: '46px',
  padding: `0 ${vars.space.sm}`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  fontWeight: 500,
  textDecoration: 'none',
  borderBottom: '2px solid transparent',
  marginBottom: '-1px',
  whiteSpace: 'nowrap',
  transition: `color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { color: vars.color.text },
  },
})

export const subnavLinkActive = style([
  subnavLink,
  {
    color: vars.color.primary,
    borderBottomColor: vars.color.primary,
  },
])

// --- 页面标题 + 操作按钮 ---

export const pageHeader = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.space.md,
  marginTop: vars.space.lg,
  marginBottom: vars.space.md,
})

export const pageTitle = style({
  flex: 1,
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  color: vars.color.text,
  margin: 0,
})

export const pageActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
})

// --- 内容 ---

export const main = style({
  width: '100%',
  maxWidth: '1240px',
  margin: '0 auto',
  padding: `${vars.space.lg} ${vars.space.lg} ${vars.space.xl}`,
  '@media': {
    'screen and (max-width: 640px)': {
      padding: `${vars.space.md} ${vars.space.md} ${vars.space.lg}`,
    },
  },
})
