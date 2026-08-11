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
  minWidth: 720,
  borderCollapse: 'collapse',
  fontSize: vars.fontSize.sm,
})

export const compactTableWide = style({ minWidth: 920 })

export const compactTableAudit = style({ minWidth: 1120 })

export const dataScroll = style({
  maxWidth: '100%',
  overflowX: 'auto',
  overscrollBehaviorX: 'contain',
  scrollBehavior: 'smooth',
  scrollbarColor: `${vars.color.borderStrong} transparent`,
  scrollbarWidth: 'thin',
  selectors: {
    '&:focus-visible': {
      outline: `2px solid ${vars.color.primary}`,
      outlineOffset: -2,
    },
  },
})

globalStyle(`${dataScroll}::-webkit-scrollbar`, { height: 8 })
globalStyle(`${dataScroll}::-webkit-scrollbar-thumb`, {
  backgroundColor: vars.color.borderStrong,
  border: '2px solid transparent',
  borderRadius: vars.radius.full,
  backgroundClip: 'padding-box',
})

export const dataScrollFrame = style({
  minWidth: 0,
  maxWidth: '100%',
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
  whiteSpace: 'nowrap',
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
    'screen and (max-width: 1180px)': {
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
    'screen and (max-width: 1180px)': {
      position: 'static',
      flexDirection: 'row',
      gap: vars.space.sm,
      overflowX: 'auto',
      overscrollBehaviorX: 'contain',
      scrollbarColor: `${vars.color.borderStrong} transparent`,
      scrollbarWidth: 'thin',
    },
  },
})

export const settingsGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  '@media': {
    'screen and (max-width: 1180px)': {
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
  '@media': { 'screen and (max-width: 1180px)': { display: 'none' } },
})

export const settingsNavLink = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minHeight: 44,
  padding: `6px ${vars.space.md}`,
  border: 0,
  borderRadius: vars.radius.md,
  background: 'transparent',
  color: vars.color.textSecondary,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  textAlign: 'left',
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
  '@media': { 'screen and (max-width: 1180px)': { whiteSpace: 'nowrap' } },
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
    'screen and (max-width: 900px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
    'screen and (max-width: 640px)': { padding: vars.space.lg },
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
export const accountName = style({ margin: 0, color: vars.color.text, fontSize: vars.fontSize.xl, lineHeight: 1.25, letterSpacing: '-0.02em', overflowWrap: 'anywhere' })
export const accountMeta = style({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: vars.space.sm, margin: '6px 0 0', color: vars.color.textSecondary, fontSize: vars.fontSize.sm })
export const metaDivider = style({ width: '3px', height: '3px', borderRadius: vars.radius.full, backgroundColor: vars.color.borderStrong })
export const accountActions = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  '@media': { 'screen and (max-width: 520px)': { alignItems: 'stretch' } },
})

globalStyle(`${accountActions} > button`, {
  '@media': { 'screen and (max-width: 520px)': { flex: '1 1 0' } },
})

export const credentialsPanel = style({
  backgroundColor: vars.color.surface, border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg, overflow: 'hidden',
})
export const credentialsHeader = style({
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 0.7fr)', gap: vars.space.lg,
  alignItems: 'end', padding: `20px ${vars.space.xl}`, borderBottom: `1px solid ${vars.color.border}`,
  '@media': {
    'screen and (max-width: 900px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
    'screen and (max-width: 640px)': { padding: vars.space.lg },
  },
})
export const credentialsTitle = style({ margin: 0, color: vars.color.text, fontSize: vars.fontSize.lg, letterSpacing: '-0.01em' })
export const credentialsHint = style({ margin: 0, color: vars.color.textSecondary, fontSize: vars.fontSize.sm, lineHeight: 1.6 })

export const credentialSwitcher = style({
  padding: `${vars.space.sm} ${vars.space.xl}`,
  borderBottom: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.background,
  '@media': {
    'screen and (max-width: 640px)': { padding: vars.space.sm },
  },
})

export const credentialTabs = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: vars.space.sm,
})

export const credentialTab = style({
  display: 'grid',
  gridTemplateColumns: '32px minmax(0, 1fr)',
  alignItems: 'center',
  gap: vars.space.sm,
  minWidth: 0,
  minHeight: 56,
  padding: `${vars.space.sm} ${vars.space.md}`,
  border: '1px solid transparent',
  borderRadius: vars.radius.md,
  backgroundColor: 'transparent',
  color: vars.color.textSecondary,
  fontFamily: vars.font.body,
  textAlign: 'left',
  cursor: 'pointer',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover, color: vars.color.text },
    '&:focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
  },
  '@media': {
    'screen and (max-width: 520px)': {
      gridTemplateColumns: '24px minmax(0, 1fr)',
      gap: vars.space.xs,
      minHeight: 48,
      padding: `6px ${vars.space.sm}`,
    },
  },
})

export const credentialTabActive = style({
  borderColor: vars.color.primarySubtle,
  backgroundColor: vars.color.primarySubtle,
  color: vars.color.primary,
  selectors: { '&:hover': { backgroundColor: vars.color.primarySubtle, color: vars.color.primary } },
})

export const credentialTabIcon = style({ display: 'grid', placeItems: 'center', width: 32, height: 32, '@media': { 'screen and (max-width: 520px)': { width: 24, height: 24 } } })
export const credentialTabCopy = style({ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 })
export const credentialTabLabel = style({ color: 'inherit', fontSize: vars.fontSize.sm, fontWeight: 600, whiteSpace: 'nowrap' })
export const credentialTabMeta = style({
  color: 'inherit',
  fontSize: vars.fontSize.xs,
  fontWeight: 400,
  opacity: 0.82,
  whiteSpace: 'nowrap',
  '@media': { 'screen and (max-width: 680px)': { display: 'none' } },
})

export const credentialWorkspace = style({ minWidth: 0 })

export const credentialGroup = style({
  padding: `22px ${vars.space.xl}`,
  borderBottom: `1px solid ${vars.color.border}`,
  selectors: { '&:last-child': { borderBottom: 'none' } },
  '@media': {
    'screen and (max-width: 640px)': { padding: vars.space.lg },
    'screen and (max-width: 480px)': { padding: vars.space.md },
  },
})

export const credentialGroupHeader = style({
  display: 'grid',
  gridTemplateColumns: '40px minmax(0, 1fr) auto',
  gap: vars.space.md,
  alignItems: 'start',
  '@media': {
    'screen and (max-width: 680px)': { gridTemplateColumns: '40px minmax(0, 1fr)' },
  },
})

export const credentialGroupIcon = style({
  display: 'grid',
  placeItems: 'center',
  width: 40,
  height: 40,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.primarySubtle,
  color: vars.color.primary,
})

export const credentialGroupCopy = style({ minWidth: 0 })

export const credentialTitleLine = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  minHeight: 24,
})

export const credentialGroupTitle = style({
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.md,
  fontWeight: 600,
})

export const credentialGroupHint = style({
  margin: `${vars.space.xs} 0 0`,
  maxWidth: '64ch',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.55,
})

export const credentialGroupAction = style({
  display: 'flex',
  justifyContent: 'flex-end',
  flexShrink: 0,
  '@media': {
    'screen and (max-width: 680px)': { gridColumn: '2', justifyContent: 'flex-start' },
    'screen and (max-width: 480px)': { gridColumn: '1 / -1' },
  },
})

globalStyle(`${credentialGroupAction} > button`, {
  '@media': { 'screen and (max-width: 480px)': { width: '100%' } },
})

export const statusBadge = style({ display: 'inline-flex', alignItems: 'center', gap: '6px', color: vars.color.success, fontSize: vars.fontSize.xs, fontWeight: 600 })
export const statusDotSmall = style({ width: '6px', height: '6px', borderRadius: vars.radius.full, backgroundColor: vars.color.success })
export const statusBadgeMuted = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.xs, fontWeight: 600 })
export const credentialStatusError = style({ color: vars.color.danger, fontSize: vars.fontSize.xs, fontWeight: 600 })

export const credentialBody = style({
  marginTop: vars.space.lg,
  marginLeft: 56,
  '@media': { 'screen and (max-width: 680px)': { marginLeft: 0 } },
})

export const credentialFacts = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: vars.space.md,
  paddingTop: vars.space.md,
  borderTop: `1px solid ${vars.color.border}`,
  '@media': {
    'screen and (max-width: 800px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
    'screen and (max-width: 480px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
})

export const credentialFact = style({ display: 'flex', flexDirection: 'column', gap: vars.space.xs, minWidth: 0 })
export const credentialFactLabel = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.xs, fontWeight: 500 })
export const credentialFactValue = style({
  color: vars.color.text,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
})

export const credentialList = style({ borderTop: `1px solid ${vars.color.border}` })

export const credentialItem = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 1fr) minmax(170px, 0.75fr) auto',
  gap: vars.space.md,
  alignItems: 'center',
  minHeight: 72,
  padding: `${vars.space.md} 0`,
  borderBottom: `1px solid ${vars.color.border}`,
  selectors: { '&:last-child': { borderBottom: 'none' } },
  '@media': {
    'screen and (max-width: 760px)': {
      gridTemplateColumns: 'minmax(0, 1fr) auto',
    },
    'screen and (max-width: 520px)': { gridTemplateColumns: 'minmax(0, 1fr)', alignItems: 'start' },
  },
})

export const credentialItemIdentity = style({ display: 'flex', flexDirection: 'column', gap: vars.space.xs, minWidth: 0 })
export const credentialItemName = style({ color: vars.color.text, fontSize: vars.fontSize.sm, fontWeight: 600 })
export const credentialItemId = style({ color: vars.color.textSecondary, fontFamily: vars.font.mono, fontSize: vars.fontSize.xs, overflowWrap: 'anywhere' })
export const credentialItemMeta = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: vars.space.xs,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  overflowWrap: 'anywhere',
  '@media': {
    'screen and (max-width: 760px)': { gridColumn: '1', gridRow: 2 },
    'screen and (max-width: 520px)': { gridColumn: '1', gridRow: 'auto' },
  },
})

export const credentialItemActions = style({ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: vars.space.xs })

export const credentialEmpty = style({ padding: `${vars.space.md} 0`, color: vars.color.textSecondary, fontSize: vars.fontSize.sm, lineHeight: 1.55 })
export const credentialError = style([credentialEmpty, { color: vars.color.danger }])

export const credentialSubsection = style({ marginTop: vars.space.lg, paddingTop: vars.space.lg, borderTop: `1px solid ${vars.color.border}` })
export const credentialSubsectionHeader = style({ display: 'flex', flexDirection: 'column', gap: vars.space.xs, marginBottom: vars.space.sm })
export const credentialSubsectionTitle = style({ margin: 0, color: vars.color.text, fontSize: vars.fontSize.sm, fontWeight: 600 })
export const credentialSubsectionHint = style({ margin: 0, color: vars.color.textSecondary, fontSize: vars.fontSize.xs, lineHeight: 1.5 })
export const bucketList = style({ display: 'flex', flexDirection: 'column' })
export const bucketRow = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: vars.space.md,
  minHeight: 60,
  padding: `${vars.space.sm} 0`,
  borderBottom: `1px solid ${vars.color.border}`,
  selectors: { '&:last-child': { borderBottom: 'none' } },
  '@media': { 'screen and (max-width: 480px)': { gridTemplateColumns: 'minmax(0, 1fr)' } },
})

export const tokenRevealRow = style({
  display: 'flex',
  gap: vars.space.sm,
  minWidth: 0,
  '@media': { 'screen and (max-width: 480px)': { flexDirection: 'column' } },
})

globalStyle(`${tokenRevealRow} > button`, {
  '@media': { 'screen and (max-width: 480px)': { width: '100%' } },
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

// --- 设置模块：标题、说明与主操作 ---

export const sectionHeaderWithAction = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.lg,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
  '@media': {
    'screen and (max-width: 900px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
      gap: vars.space.md,
    },
  },
})

export const sectionHeaderCopy = style({ minWidth: 0 })

export const sectionHeaderAction = style({
  display: 'flex',
  flexShrink: 0,
})

globalStyle(`${sectionHeaderAction} > button`, {
  width: '100%',
})

// --- 存储源：信息优先的响应式列表 ---

export const sourceList = style({
  display: 'flex',
  flexDirection: 'column',
})

export const sourceItem = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(480px, 1fr) auto auto',
  alignItems: 'center',
  gap: vars.space.md,
  minWidth: 1040,
  padding: `20px ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:last-child': { borderBottom: 'none' },
    '&:hover': { backgroundColor: vars.color.surfaceHover },
  },
})

export const sourceIdentity = style({
  display: 'grid',
  gridTemplateColumns: '40px minmax(0, 1fr)',
  alignItems: 'center',
  gap: vars.space.md,
  minWidth: 0,
})

export const sourceIcon = style({
  display: 'grid',
  placeItems: 'center',
  width: 40,
  height: 40,
  borderRadius: vars.radius.tile,
  backgroundColor: vars.color.primarySubtle,
  color: vars.color.primarySubtleInk,
})

export const sourceCopy = style({ minWidth: 0 })

export const sourceName = style({
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  lineHeight: 1.4,
})

export const sourcePath = style({
  display: 'block',
  marginTop: vars.space.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  lineHeight: 1.45,
  whiteSpace: 'nowrap',
})

export const sourceMeta = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, auto)',
  alignItems: 'center',
  gap: vars.space.lg,
})

export const sourceMetaItem = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '5px',
  minWidth: 52,
})

export const sourceMetaLabel = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
})

export const sourceMetaValue = style({
  color: vars.color.text,
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  whiteSpace: 'nowrap',
})

export const sourceMetaMuted = style([sourceMetaValue, { color: vars.color.textSecondary, fontWeight: 400 }])

export const sourceActions = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: vars.space.xs,
})

globalStyle(`${sourceActions} > button`, {
  flex: '0 0 auto',
})

export const sourceState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
  minHeight: 160,
  padding: vars.space.lg,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  textAlign: 'center',
})

export const sourceStateTitle = style({
  margin: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.md,
  fontWeight: 600,
})

export const sourceStateHint = style({ margin: 0, maxWidth: '46ch', lineHeight: 1.55 })

export const exportSummary = style({
  display: 'grid',
  gridTemplateColumns: '44px minmax(0, 1fr) auto',
  gap: vars.space.md,
  alignItems: 'center',
  '@media': {
    'screen and (max-width: 640px)': {
      gridTemplateColumns: '44px minmax(0, 1fr)',
      alignItems: 'start',
    },
  },
})

export const exportIcon = style({
  display: 'grid',
  placeItems: 'center',
  width: 44,
  height: 44,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.primarySubtle,
  color: vars.color.primary,
})

export const exportCopy = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  color: vars.color.text,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.55,
})

export const exportCopySecondary = style({ color: vars.color.textSecondary })

export const exportAction = style({
  display: 'flex',
  justifyContent: 'flex-end',
  '@media': {
    'screen and (max-width: 640px)': {
      gridColumn: '1 / -1',
      justifyContent: 'flex-start',
      paddingLeft: 60,
    },
  },
})

export const exportNotice = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  padding: vars.space.md,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.background,
  color: vars.color.text,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.55,
})

export const exportMessage = style({
  margin: 0,
  color: vars.color.success,
  fontSize: vars.fontSize.sm,
})

export const exportMessageError = style([exportMessage, { color: vars.color.danger }])

export const auditFilters = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(130px, 0.7fr)) minmax(240px, 1.5fr) auto',
  gap: vars.space.md,
  alignItems: 'end',
  padding: vars.space.lg,
  borderBottom: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.surface,
  '@media': {
    'screen and (max-width: 1480px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
    'screen and (max-width: 560px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
})

export const auditFilterActions = style({
  display: 'flex',
  gap: vars.space.sm,
  alignItems: 'center',
})

export const auditMessage = style({
  padding: vars.space.md,
  textAlign: 'center',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

export const auditPagination = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.md,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderTop: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
  '@media': {
    'screen and (max-width: 560px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
})

export const auditPaginationActions = style({
  display: 'flex',
  gap: vars.space.sm,
})

// 单行 key-value 列表
export const kvRow = style({
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  gap: vars.space.md,
  alignItems: 'center',
  fontSize: vars.fontSize.sm,
  '@media': {
    'screen and (max-width: 480px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: vars.space.xs,
      alignItems: 'start',
    },
  },
})

export const kvLabel = style({
  color: vars.color.textSecondary,
})

export const kvValue = style({
  minWidth: 0,
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
  display: 'grid',
  gridTemplateColumns: '24px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: vars.space.md,
  color: vars.color.danger,
  fontSize: vars.fontSize.sm,
  '@media': {
    'screen and (max-width: 560px)': {
      gridTemplateColumns: '24px minmax(0, 1fr)',
      alignItems: 'start',
    },
  },
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
  minWidth: 0,
  color: vars.color.text,
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
})

globalStyle(`${dangerBox} > button`, {
  '@media': {
    'screen and (max-width: 560px)': {
      gridColumn: '2',
      justifySelf: 'start',
    },
  },
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

export const policySummary = style({
  display: 'flex',
  flexWrap: 'nowrap',
  gap: vars.space.xs,
})

globalStyle(`${compactTable} ${formRow}`, { flexWrap: 'nowrap' })

export const policyEditorList = style({
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 420,
  overflowY: 'auto',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
})

export const policySourceBlock = style({
  borderBottom: `1px solid ${vars.color.border}`,
  selectors: {
    '&:last-child': { borderBottom: 'none' },
  },
})

export const policyEditorRow = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: vars.space.md,
  minHeight: 48,
  padding: `${vars.space.sm} ${vars.space.md}`,
  '@media': {
    'screen and (max-width: 520px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: vars.space.sm,
    },
  },
})

export const policyPathRules = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: vars.space.sm,
  padding: `0 ${vars.space.md} ${vars.space.md} 42px`,
  '@media': {
    'screen and (max-width: 520px)': { paddingLeft: vars.space.md },
  },
})

export const policyPathRuleRow = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 1fr) auto auto',
  gap: vars.space.sm,
  alignItems: 'center',
  width: '100%',
  '@media': {
    'screen and (max-width: 520px)': {
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      paddingLeft: 0,
    },
  },
})

globalStyle(`${policyPathRuleRow} > :first-child`, {
  '@media': {
    'screen and (max-width: 520px)': { gridColumn: '1 / -1' },
  },
})

export const policyEditorIdentity = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  minWidth: 0,
  color: vars.color.text,
  fontSize: vars.fontSize.sm,
})

export const policyEditorMeta = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
})

export const policyEditorEmpty = style({
  margin: 0,
  padding: vars.space.md,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

export const sourcePreview = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.md,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.background,
})

export const sourcePreviewHeader = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: vars.space.md,
})

export const sourcePreviewEyebrow = style({
  display: 'block',
  marginBottom: vars.space.xs,
  color: vars.color.success,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
})

export const sourcePreviewPath = style({
  color: vars.color.text,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  overflowWrap: 'anywhere',
})

export const sourcePreviewStats = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: vars.space.sm,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  '@media': {
    'screen and (max-width: 520px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  },
})

export const sourcePreviewStatValue = style({
  display: 'block',
  marginBottom: '2px',
  color: vars.color.text,
  fontSize: vars.fontSize.lg,
})

export const sourcePreviewEntries = style({
  maxHeight: '190px',
  overflowY: 'auto',
  borderTop: `1px solid ${vars.color.border}`,
  borderBottom: `1px solid ${vars.color.border}`,
})

export const sourcePreviewEntry = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: vars.space.sm,
  minHeight: '36px',
  padding: `6px ${vars.space.xs}`,
  borderBottom: `1px solid ${vars.color.border}`,
  color: vars.color.text,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  selectors: {
    '&:last-child': { borderBottom: 'none' },
  },
})

export const sourcePreviewEntryName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const sourcePreviewEmpty = style({
  margin: 0,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

export const sourcePreviewWarnings = style({
  margin: 0,
  paddingLeft: '18px',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  lineHeight: 1.55,
})
