import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const shell = style({
  minHeight: '100vh',
  display: 'flex',
  '@media': {
    'screen and (max-width: 820px)': {
      flexDirection: 'column',
    },
  },
})

// --- 侧栏（桌面）/ 顶部导航（移动） ---

export const sidebar = style({
  width: '232px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: vars.color.surface,
  borderRight: `1px solid ${vars.color.border}`,
  padding: vars.space.md,
  position: 'sticky',
  top: 0,
  height: '100vh',
  '@media': {
    'screen and (max-width: 820px)': {
      width: '100%',
      height: 'auto',
      position: 'static',
      flexDirection: 'row',
      alignItems: 'center',
      gap: vars.space.sm,
      borderRight: 'none',
      borderBottom: `1px solid ${vars.color.border}`,
      padding: `${vars.space.sm} ${vars.space.md}`,
      overflowX: 'auto',
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
  padding: `${vars.space.sm} ${vars.space.sm} ${vars.space.lg}`,
  '@media': {
    'screen and (max-width: 820px)': {
      padding: 0,
      marginRight: vars.space.sm,
    },
  },
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
  flexDirection: 'column',
  gap: '2px',
  '@media': {
    'screen and (max-width: 820px)': {
      flexDirection: 'row',
      flex: 1,
    },
  },
})

export const navLink = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: `10px ${vars.space.md}`,
  borderRadius: vars.radius.md,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.surfaceHover,
      color: vars.color.text,
    },
  },
})

export const navLinkActive = style([
  navLink,
  {
    backgroundColor: vars.color.primarySubtle,
    color: vars.color.primary,
    selectors: {
      '&:hover': {
        backgroundColor: vars.color.primarySubtle,
        color: vars.color.primary,
      },
    },
  },
])

export const sidebarSpacer = style({
  flex: 1,
  '@media': {
    'screen and (max-width: 820px)': {
      display: 'none',
    },
  },
})

// --- 配额卡（侧栏底部） ---

export const quotaCard = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: vars.space.md,
  marginTop: vars.space.md,
  '@media': {
    'screen and (max-width: 820px)': {
      display: 'none',
    },
  },
})

export const quotaHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: vars.space.sm,
})

export const quotaTitle = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontWeight: 500,
})

export const quotaInfo = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '18px',
  borderRadius: vars.radius.full,
  color: vars.color.textSecondary,
  backgroundColor: vars.color.surfaceHover,
  fontSize: '10px',
  fontWeight: 600,
})

export const quotaUsage = style({
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.text,
  marginBottom: vars.space.xs,
})

export const quotaCapacity = style({
  fontWeight: 400,
  color: vars.color.textSecondary,
})

export const quotaBar = style({
  position: 'relative',
  height: '6px',
  backgroundColor: vars.color.border,
  borderRadius: vars.radius.full,
  overflow: 'hidden',
  marginBottom: vars.space.sm,
})

export const quotaBarFill = style({
  position: 'absolute',
  inset: '0 auto 0 0',
  backgroundColor: vars.color.primary,
  borderRadius: vars.radius.full,
})

export const quotaMeta = style({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  marginBottom: vars.space.sm,
})

export const quotaLink = style({
  display: 'block',
  fontSize: vars.fontSize.xs,
  color: vars.color.primary,
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: vars.font.body,
  cursor: 'pointer',
  selectors: {
    '&:hover': { textDecoration: 'underline' },
  },
})

// --- 内容区 ---

export const content = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
})

export const topbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  height: '64px',
  padding: `0 ${vars.space.lg}`,
  backgroundColor: vars.color.surface,
  borderBottom: `1px solid ${vars.color.border}`,
  position: 'sticky',
  top: 0,
  zIndex: vars.zIndex.sticky,
  '@media': {
    'screen and (max-width: 820px)': {
      display: 'none',
    },
  },
})

export const topbarTitle = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  margin: 0,
  whiteSpace: 'nowrap',
  flexShrink: 0,
})

export const topbarSpacer = style({
  flex: 1,
})

export const topbarSearch = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  width: '320px',
  '@media': {
    'screen and (max-width: 1024px)': {
      width: '220px',
    },
  },
})

export const topbarSearchIcon = style({
  position: 'absolute',
  left: '12px',
  color: vars.color.textSecondary,
  pointerEvents: 'none',
  display: 'inline-flex',
})

export const topbarSearchInput = style({
  width: '100%',
  height: '36px',
  padding: '0 12px 0 36px',
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  color: vars.color.text,
  backgroundColor: vars.color.background,
  border: `1px solid transparent`,
  borderRadius: vars.radius.md,
  outline: 'none',
  transition: `border-color ${vars.motion.fast} ${vars.motion.ease}, background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&::placeholder': { color: vars.color.textSecondary },
    '&:hover': { backgroundColor: vars.color.surfaceHover },
    '&:focus': {
      backgroundColor: vars.color.surface,
      borderColor: vars.color.primary,
    },
  },
})

export const topbarKbd = style({
  position: 'absolute',
  right: '10px',
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: '1px 6px',
  fontFamily: vars.font.mono,
  pointerEvents: 'none',
})

export const userMenu = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexShrink: 0,
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
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover },
  },
})

export const avatar = style({
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
  overflow: 'hidden',
})

export const userName = style({
  fontSize: vars.fontSize.md,
  fontWeight: 500,
  '@media': {
    'screen and (max-width: 1024px)': {
      display: 'none',
    },
  },
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

export const main = style({
  flex: 1,
  width: '100%',
  maxWidth: '1240px',
  margin: '0 auto',
  padding: vars.space.lg,
  '@media': {
    'screen and (max-width: 640px)': {
      padding: vars.space.md,
    },
  },
})

// 移动端顶栏里的账号操作
export const mobileUser = style({
  display: 'none',
  '@media': {
    'screen and (max-width: 820px)': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: vars.space.sm,
    },
  },
})
