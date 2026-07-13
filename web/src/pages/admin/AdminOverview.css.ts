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
