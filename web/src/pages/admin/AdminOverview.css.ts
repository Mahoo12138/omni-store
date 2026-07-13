import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// 顶部统计卡：4 个并排
export const statRow = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: vars.space.md,
  marginBottom: vars.space.lg,
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
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  lineHeight: 1.1,
})

export const statValueText = style({
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  color: vars.color.text,
  lineHeight: 1.1,
})

export const statTrend = style({
  display: 'inline-flex',
  color: vars.color.textSecondary,
})

// 双列布局：左 = 存储源 + 用户与权限；右 = 系统状态 + 最近审计
export const grid2 = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
  gap: vars.space.lg,
  alignItems: 'start',
  '@media': {
    'screen and (max-width: 1080px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
})

export const panel = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  marginBottom: vars.space.lg,
  overflow: 'hidden',
})

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.surface,
})

export const panelTitle = style({
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.text,
  margin: 0,
})

// 表格行（紧凑）
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
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover },
  },
})

// vanilla-extract 不允许在 selectors 里写 `&:last-child td`，
// 改用 globalStyle 在外层包裹：最后一行无下边框。
globalStyle(`${compactTr}:last-child td`, {
  borderBottom: 'none',
})

// 系统状态：键值对列表
export const statusList = style({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: vars.space.lg,
  rowGap: vars.space.sm,
  padding: vars.space.lg,
  fontSize: vars.fontSize.sm,
})

export const statusLabel = style({
  color: vars.color.textSecondary,
})

export const statusValue = style({
  color: vars.color.text,
  fontWeight: 500,
  wordBreak: 'break-all',
})

// 状态值小色块
export const statusDot = style({
  display: 'inline-block',
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  marginRight: '6px',
  verticalAlign: '1px',
})

// --- 系统设置页布局：左侧分组的子导航 + 右侧内容（docs/settings-layout.png）---

export const settingsLayout = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(160px, 200px) minmax(0, 1fr)',
  gap: vars.space.lg,
  alignItems: 'start',
  marginTop: vars.space.lg,
  '@media': {
    'screen and (max-width: 820px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
})

export const settingsSide = style({
  position: 'sticky',
  top: '88px',
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  fontSize: vars.fontSize.sm,
})

export const settingsGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
})

export const settingsGroupTitle = style({
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  userSelect: 'none',
})

export const settingsNavLink = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: `6px ${vars.space.md}`,
  borderRadius: vars.radius.md,
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

export const settingsNavLinkActive = style([
  settingsNavLink,
  {
    backgroundColor: vars.color.primarySubtle,
    color: vars.color.primary,
    fontWeight: 500,
  },
])

export const settingsContent = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
})

export const settingsFooter = style({
  marginTop: vars.space.xl,
  paddingTop: vars.space.md,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  whiteSpace: 'pre-line',
  lineHeight: 1.5,
})

// 设置区块（标题 + 卡片）
export const section = style({
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  overflow: 'hidden',
})

export const sectionHeader = style({
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
})

export const sectionTitle = style({
  margin: 0,
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.text,
})

export const sectionHint = style({
  margin: `${vars.space.xs} 0 0`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

export const sectionBody = style({
  padding: vars.space.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
})

// 单行 key-value 列表
export const kvRow = style({
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  gap: vars.space.md,
  alignItems: 'center',
  fontSize: vars.fontSize.sm,
})

export const kvLabel = style({
  color: vars.color.textSecondary,
})

export const kvValue = style({
  color: vars.color.text,
  fontFamily: vars.font.mono,
  wordBreak: 'break-all',
})

// 危险操作卡
export const dangerBox = style({
  backgroundColor: vars.color.dangerSubtle,
  border: `1px solid ${vars.color.danger}`,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  color: vars.color.danger,
  fontSize: vars.fontSize.sm,
})

export const dangerIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  flexShrink: 0,
  color: vars.color.danger,
})

export const dangerText = style({
  flex: 1,
  color: vars.color.text,
})

// 表单行
export const formRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  alignItems: 'center',
})

export const formRowLabel = style({
  display: 'block',
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  marginBottom: '4px',
})
