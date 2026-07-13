import { style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

// 仪表盘主区：左中（欢迎 + 统计卡 + 存储源概览）+ 右（系统状态 / 最近审计日志）
export const layout = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 320px',
  gap: vars.space.lg,
  alignItems: 'start',
  '@media': {
    'screen and (max-width: 1080px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
})

export const mainCol = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
  minWidth: 0,
})

export const sideCol = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
  minWidth: 0,
})

// --- 页面头：标题 + 右上操作按钮 ---

export const pageHeader = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.space.md,
})

export const pageTitle = style({
  flex: 1,
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  margin: 0,
  color: vars.color.text,
})

export const pageActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
})

// --- 欢迎区（docs/home-1.png）---

export const welcome = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  padding: vars.space.lg,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
})

export const welcomeIcon = style({
  width: '56px',
  height: '56px',
  borderRadius: vars.radius.lg,
  backgroundColor: vars.color.primarySubtle,
  color: vars.color.primary,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
})

export const welcomeText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  flex: 1,
})

export const welcomeTitle = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  margin: 0,
  color: vars.color.text,
})

export const welcomeSub = style({
  margin: 0,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

// --- 统计卡 4 个并排（docs/home-1.png）---

export const statRow = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: vars.space.md,
  '@media': {
    'screen and (max-width: 1080px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
    'screen and (max-width: 480px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
})

export const statCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: vars.space.md,
})

export const statIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '44px',
  height: '44px',
  borderRadius: vars.radius.md,
  flexShrink: 0,
})

export const statBody = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
})

export const statLabel = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
})

export const statValue = style({
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  color: vars.color.text,
  lineHeight: 1.1,
  display: 'flex',
  alignItems: 'baseline',
  gap: '4px',
})

export const statUnit = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  color: vars.color.textSecondary,
})

// --- 区块标题（用于"存储源概览"面板）---

export const panel = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  overflow: 'hidden',
})

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
})

export const panelTitle = style({
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  margin: 0,
  color: vars.color.text,
})

// --- 存储源概览：无存储源 empty state + 有存储源表格 ---

export const sourceEmpty = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.md,
  padding: `${vars.space.xl} ${vars.space.lg}`,
  textAlign: 'center',
})

export const sourceEmptyIcon = style({
  width: '72px',
  height: '72px',
  borderRadius: vars.radius.lg,
  backgroundColor: vars.color.primarySubtle,
  color: vars.color.primary,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
})

export const sourceEmptyTitle = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  color: vars.color.text,
  margin: 0,
})

export const sourceEmptyDesc = style({
  margin: 0,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
})

// --- 存储源表格（紧凑） ---

export const compactTable = style({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: vars.fontSize.sm,
})

export const compactTh = style({
  textAlign: 'left',
  padding: `10px ${vars.space.md}`,
  color: vars.color.textSecondary,
  fontWeight: 500,
  backgroundColor: vars.color.surface,
  borderBottom: `1px solid ${vars.color.border}`,
  whiteSpace: 'nowrap',
})

export const compactTd = style({
  padding: `10px ${vars.space.md}`,
  color: vars.color.text,
  borderBottom: `1px solid ${vars.color.border}`,
  verticalAlign: 'middle',
})

export const compactTr = style({
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover },
  },
})

export const compactName = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  fontWeight: 500,
})

// --- 右栏通用卡 ---

export const sidePanel = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  overflow: 'hidden',
})

export const sidePanelHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
})

export const sidePanelTitle = style({
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  margin: 0,
  color: vars.color.text,
})

export const sidePanelLink = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.primary,
  textDecoration: 'none',
  selectors: {
    '&:hover': { textDecoration: 'underline' },
  },
})

// --- 系统状态：图标 + 标题 + 副标题 + 右上徽章 ---

export const statusList = style({
  display: 'flex',
  flexDirection: 'column',
  padding: `${vars.space.sm} 0`,
})

export const statusRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.lg}`,
})

export const statusIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.md,
  flexShrink: 0,
})

export const statusBody = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
})

export const statusTitle = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  color: vars.color.text,
})

export const statusDesc = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
})

// --- 最近审计日志 ---

export const activityList = style({
  display: 'flex',
  flexDirection: 'column',
  padding: `${vars.space.sm} 0`,
})

export const activityRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.lg}`,
})

export const activityIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
})

export const activityBody = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
})

export const activityTitle = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  color: vars.color.text,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const activityMeta = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
})

export const activityTime = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  flexShrink: 0,
})

export const activityEmpty = style({
  padding: `${vars.space.lg} ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  textAlign: 'center',
})

// --- 页脚 ---

export const footer = style({
  marginTop: vars.space.xl,
  padding: `${vars.space.md} 0`,
  textAlign: 'center',
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  borderTop: `1px solid ${vars.color.border}`,
})
