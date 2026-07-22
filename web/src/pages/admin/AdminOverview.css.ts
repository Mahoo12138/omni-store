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
  marginTop: 0,
  '@media': {
    'screen and (max-width: 820px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
})

export const settingsSide = style({
  position: 'sticky',
  top: '32px',
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: 10,
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.sm,
  fontSize: vars.fontSize.sm,
  '@media': {
    'screen and (max-width: 820px)': {
      position: 'static',
      flexDirection: 'row',
      gap: vars.space.md,
      overflowX: 'auto',
      scrollbarWidth: 'thin',
    },
  },
})

export const settingsGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  '@media': {
    'screen and (max-width: 820px)': {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
      gap: 4,
    },
  },
})

export const settingsGroupTitle = style({
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  userSelect: 'none',
  '@media': { 'screen and (max-width: 820px)': { display: 'none' } },
})

export const settingsNavLink = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minHeight: 40,
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
    '&:focus-visible': {
      outline: `2px solid ${vars.color.primary}`,
      outlineOffset: 2,
    },
  },
  '@media': { 'screen and (max-width: 820px)': { whiteSpace: 'nowrap' } },
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

export const profilePage = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
})

export const accountPanel = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: vars.space.lg,
  padding: '28px 30px',
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.sm,
  '@media': {
    'screen and (max-width: 640px)': { gridTemplateColumns: 'minmax(0, 1fr)', padding: vars.space.lg },
  },
})

export const accountIdentity = style({ display: 'flex', alignItems: 'center', gap: vars.space.md, minWidth: 0 })
export const accountAvatar = style({
  display: 'grid', placeItems: 'center', width: '52px', height: '52px', flexShrink: 0,
  borderRadius: vars.radius.tile, backgroundColor: vars.color.primarySubtle,
  color: vars.color.primarySubtleInk, fontSize: vars.fontSize.xl, fontWeight: 700,
})
export const accountCopy = style({ minWidth: 0 })
export const eyebrow = style({
  display: 'block', marginBottom: '5px', color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
})
export const accountName = style({ margin: 0, color: vars.color.text, fontSize: vars.fontSize.xl, lineHeight: 1.25, letterSpacing: '-0.02em' })
export const accountMeta = style({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: vars.space.sm, margin: '6px 0 0', color: vars.color.textSecondary, fontSize: vars.fontSize.sm })
export const metaDivider = style({ width: '3px', height: '3px', borderRadius: vars.radius.full, backgroundColor: vars.color.borderStrong })
export const accountActions = style({ display: 'flex', flexWrap: 'wrap', gap: vars.space.sm })

export const credentialsPanel = style({
  backgroundColor: vars.color.surface, border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg, overflow: 'hidden', boxShadow: vars.shadow.sm,
})
export const credentialsHeader = style({
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 0.7fr)', gap: vars.space.lg,
  alignItems: 'end', padding: '24px 30px 20px', borderBottom: `1px solid ${vars.color.border}`,
  '@media': { 'screen and (max-width: 640px)': { gridTemplateColumns: 'minmax(0, 1fr)', padding: vars.space.lg } },
})
export const credentialsTitle = style({ margin: 0, color: vars.color.text, fontSize: vars.fontSize.lg, letterSpacing: '-0.01em' })
export const credentialsHint = style({ margin: 0, color: vars.color.textSecondary, fontSize: vars.fontSize.sm, lineHeight: 1.6 })
export const tokenList = style({ padding: '0 30px', '@media': { 'screen and (max-width: 640px)': { padding: `0 ${vars.space.lg}` } } })
export const tokenRow = style({
  display: 'grid', gridTemplateColumns: '40px minmax(180px, 1fr) minmax(150px, 0.7fr) auto',
  gap: vars.space.md, alignItems: 'center', padding: '22px 0', borderBottom: `1px solid ${vars.color.border}`,
  selectors: { '&:last-child': { borderBottom: 'none' } },
  '@media': {
    'screen and (max-width: 760px)': { gridTemplateColumns: '40px minmax(0, 1fr) auto' },
    'screen and (max-width: 520px)': { gridTemplateColumns: '40px minmax(0, 1fr)', alignItems: 'start' },
  },
})
export const tokenIcon = style({ display: 'grid', placeItems: 'center', width: '40px', height: '40px', borderRadius: vars.radius.md, backgroundColor: vars.color.primarySubtle, color: vars.color.primary })
export const tokenCopy = style({ minWidth: 0 })
export const tokenTitle = style({ margin: 0, color: vars.color.text, fontSize: vars.fontSize.md, fontWeight: 600 })
export const tokenHint = style({ margin: '5px 0 0', maxWidth: '48ch', color: vars.color.textSecondary, fontSize: vars.fontSize.sm, lineHeight: 1.55 })
export const tokenStatus = style({ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px', '@media': { 'screen and (max-width: 760px)': { gridColumn: '2 / -1' } } })
export const statusBadge = style({ display: 'inline-flex', alignItems: 'center', gap: '6px', color: vars.color.success, fontSize: vars.fontSize.xs, fontWeight: 600 })
export const statusDotSmall = style({ width: '6px', height: '6px', borderRadius: vars.radius.full, backgroundColor: vars.color.success })
export const statusBadgeMuted = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.xs, fontWeight: 600 })
export const tokenDate = style({ color: vars.color.text, fontFamily: vars.font.mono, fontSize: vars.fontSize.xs })
export const lastUsed = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.xs })
export const tokenAction = style({ '@media': { 'screen and (max-width: 520px)': { gridColumn: '2 / -1' } } })

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
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
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
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
})
export const dangerTitle = style({ fontWeight: 600 })
export const dangerHint = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.xs, lineHeight: 1.45 })

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
