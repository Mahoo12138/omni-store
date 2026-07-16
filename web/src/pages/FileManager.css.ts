import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

// --- 页面主区（与右栏双列） ---

export const layout = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 320px',
  gap: vars.space.lg,
  alignItems: 'start',
  '@media': {
    'screen and (max-width: 980px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
})

export const main = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  minWidth: 0,
})

export const sideCol = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  position: 'sticky',
  top: '88px',
  '@media': {
    'screen and (max-width: 980px)': {
      position: 'static',
    },
  },
})

// --- 页面头（标题 + 状态行 + 按钮） ---

export const pageHeader = style({
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: vars.space.lg,
  padding: `0 0 34px`,
  '@media': {
    'screen and (max-width: 720px)': {
      alignItems: 'flex-start',
      flexDirection: 'column',
      paddingBottom: vars.space.lg,
    },
  },
})

export const headerIntro = style({
  minWidth: 0,
})

export const pageTitle = style({
  margin: 0,
  fontSize: vars.fontSize.display,
  lineHeight: 1.1,
  fontWeight: 720,
  letterSpacing: '-0.045em',
  color: vars.color.text,
})

export const pageDescription = style({
  margin: '11px 0 0',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  lineHeight: 1.6,
})

// 状态行：Source ID / 真实路径 / 公开挂载路径
export const metaRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: `${vars.space.lg} ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
})

export const metaItem = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
})

export const metaLabel = style({
  color: vars.color.textSecondary,
  whiteSpace: 'nowrap',
})

export const metaValue = style({
  color: vars.color.text,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
})

// 状态徽章行（正常/已公开/WebDAV/图床）
export const statusRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px 16px',
  marginTop: '14px',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

// 顶部操作按钮
export const headerActions = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: vars.space.sm,
  flexShrink: 0,
})

const noticeBase = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.md,
  padding: '11px 14px',
  marginBottom: vars.space.md,
  borderRadius: vars.radius.md,
  fontSize: vars.fontSize.sm,
})

globalStyle(`${noticeBase} button`, {
  border: 0,
  padding: '3px 5px',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontWeight: 600,
})

export const noticeSuccess = style([noticeBase, {
  color: vars.color.success,
  backgroundColor: vars.color.successSubtle,
}])

export const noticeError = style([noticeBase, {
  color: vars.color.danger,
  backgroundColor: vars.color.dangerSubtle,
}])

// --- 面包屑 ---

export const crumb = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px',
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  marginBottom: vars.space.xs,
})

export const crumbLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 6px',
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  textDecoration: 'none',
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.surfaceHover,
      color: vars.color.text,
    },
  },
})

export const crumbCurrent = style({
  padding: '2px 6px',
  color: vars.color.text,
  fontWeight: 500,
})

export const crumbSep = style({
  color: vars.color.textSecondary,
  userSelect: 'none',
})

// --- 工具条：当前位置 / 搜索 / 视图切换 / 刷新 ---

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  backgroundColor: 'oklch(1 0 0 / 0.7)',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
})

export const toolbarLocation = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const searchBox = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
})

export const searchIcon = style({
  position: 'absolute',
  left: '10px',
  color: vars.color.textSecondary,
  pointerEvents: 'none',
  display: 'inline-flex',
})

export const searchInput = style({
  height: '32px',
  width: '200px',
  padding: '0 12px 0 32px',
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.body,
  color: vars.color.text,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  outline: 'none',
  transition: `border-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&::placeholder': { color: vars.color.textSecondary },
    '&:focus': { borderColor: vars.color.primary },
  },
})

export const viewToggle = style({
  display: 'inline-flex',
  alignItems: 'center',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
})

export const viewBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  background: 'transparent',
  border: 'none',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { color: vars.color.text },
  },
})

export const viewBtnActive = style([
  viewBtn,
  {
    backgroundColor: vars.color.primarySubtle,
    color: vars.color.primary,
  },
])

export const viewDivider = style({
  width: '1px',
  height: '16px',
  backgroundColor: vars.color.border,
})

export const iconBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.surfaceHover,
      color: vars.color.text,
    },
  },
})

// --- 表格行内的操作列 ---

export const actions = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
})

export const actionBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  background: 'none',
  border: 'none',
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.primarySubtle,
      color: vars.color.primary,
    },
  },
})

export const actionBtnDanger = style([
  actionBtn,
  {
    selectors: {
      '&:hover': {
        backgroundColor: vars.color.dangerSubtle,
        color: vars.color.danger,
      },
    },
  },
])

// --- 分页 ---

export const pager = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  marginTop: vars.space.md,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
})

export const pagerInfo = style({
  color: vars.color.textSecondary,
})

export const pagerNav = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
})

export const pagerBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '32px',
  height: '32px',
  padding: '0 8px',
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover:not(:disabled)': {
      backgroundColor: vars.color.surfaceHover,
      color: vars.color.text,
    },
    '&:disabled': {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
  },
})

export const pagerBtnActive = style([
  pagerBtn,
  {
    backgroundColor: vars.color.primary,
    color: 'white',
    borderColor: vars.color.primary,
  },
])

export const pagerSelect = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  color: vars.color.textSecondary,
})

export const pagerSelectNative = style({
  height: '32px',
  padding: '0 8px',
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.body,
  color: vars.color.text,
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  outline: 'none',
  cursor: 'pointer',
  selectors: {
    '&:focus': { borderColor: vars.color.primary },
  },
})

// --- 右栏：存储源信息卡 ---

export const sidePanel = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
})

export const sidePanelHeader = style({
  padding: `${vars.space.md} ${vars.space.lg}`,
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.text,
  borderBottom: `1px solid ${vars.color.border}`,
})

export const sidePanelBody = style({
  padding: vars.space.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
})

export const sideKvRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: vars.space.md,
  fontSize: vars.fontSize.sm,
})

export const sideKvLabel = style({
  color: vars.color.textSecondary,
  flexShrink: 0,
})

export const sideKvValue = style({
  color: vars.color.text,
  textAlign: 'right',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  wordBreak: 'break-all',
  minWidth: 0,
})

export const sideLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  color: vars.color.primary,
  textDecoration: 'none',
  fontSize: vars.fontSize.sm,
  selectors: {
    '&:hover': { textDecoration: 'underline' },
  },
})

// --- 空状态（无存储源） ---

const float = keyframes({
  '0%, 100%': { transform: 'translateY(0)' },
  '50%': { transform: 'translateY(-6px)' },
})

export const emptyShell = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 320px',
  gap: vars.space.lg,
  alignItems: 'start',
  '@media': {
    'screen and (max-width: 980px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
})

export const emptyMain = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${vars.space.xl} ${vars.space.lg}`,
  textAlign: 'center',
  minHeight: '60vh',
})

export const emptyIllustration = style({
  width: '180px',
  height: '180px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'oklch(0.75 0.12 230)',
  marginBottom: vars.space.lg,
  animation: `${float} 4s ease-in-out infinite`,
})

export const emptyTitle = style({
  margin: 0,
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  color: vars.color.text,
  marginBottom: vars.space.xs,
})

export const emptyHint = style({
  margin: 0,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  maxWidth: '420px',
  marginBottom: vars.space.lg,
})

export const emptyActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
  justifyContent: 'center',
})

// --- 空状态右侧："暂无可用存储源" ---

export const emptySideTitle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${vars.space.lg} 0`,
})

export const emptySideIcon = style({
  width: '100px',
  height: '100px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'oklch(0.75 0.12 230)',
  margin: '0 auto',
})

export const emptySideName = style({
  textAlign: 'center',
  fontSize: vars.fontSize.md,
  fontWeight: 500,
  color: vars.color.text,
  margin: `${vars.space.sm} 0 ${vars.space.xs}`,
})

export const emptySideDesc = style({
  textAlign: 'center',
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  lineHeight: 1.6,
  marginBottom: vars.space.md,
})

export const emptySideList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  fontSize: vars.fontSize.sm,
  color: vars.color.text,
  borderTop: `1px solid ${vars.color.border}`,
  paddingTop: vars.space.md,
})

export const emptySideListTitle = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  marginBottom: '2px',
})

export const emptySideItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  color: vars.color.text,
})

export const helpLink = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  marginTop: vars.space.md,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.primary,
  textDecoration: 'none',
  fontSize: vars.fontSize.sm,
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.primarySubtle },
  },
})

// --- 表格行的右对齐 ---

// 与公开侧 FileTable 共享，此处仅补充分页行内样式。
globalStyle(`${pager} select`, {
  fontSize: vars.fontSize.sm,
})
