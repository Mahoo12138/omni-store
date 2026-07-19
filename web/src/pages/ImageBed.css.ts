import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

const card = {
  backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.sm,
} as const

export const loadingState = style({
  ...card,
  minHeight: 320,
  display: 'grid',
  placeItems: 'center',
  color: vars.color.textSecondary,
})

export const pageHeader = style({
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: vars.space.md,
  marginBottom: 16,
})

export const pageTitle = style({
  margin: 0,
  fontSize: '28px',
  fontWeight: 700,
  letterSpacing: '-0.04em',
})

const noticeBase = style({
  borderRadius: vars.radius.md,
  padding: '8px 12px',
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
})

export const successNotice = style([noticeBase, {
  color: vars.color.success,
  background: vars.color.successSubtle,
}])

export const errorNotice = style([noticeBase, {
  color: vars.color.danger,
  background: vars.color.dangerSubtle,
}])

export const workspace = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 306px',
  gap: 24,
  alignItems: 'start',
  '@media': {
    'screen and (max-width: 1180px)': { gridTemplateColumns: '1fr' },
  },
})

export const mainColumn = style({ minWidth: 0 })

export const uploadRow = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.08fr) minmax(360px, 0.92fr)',
  gap: 16,
  alignItems: 'stretch',
  '@media': {
    'screen and (max-width: 980px)': { gridTemplateColumns: '1fr' },
  },
})

export const panel = style({
  ...card,
  minHeight: 314,
  padding: 12,
})

export const dropZone = style({
  width: '100%',
  height: '100%',
  minHeight: 288,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: 28,
  color: vars.color.text,
  background: 'oklch(0.994 0.003 248)',
  border: `1.5px dashed ${vars.color.borderStrong}`,
  borderRadius: '11px',
  cursor: 'pointer',
  transition: `border-color ${vars.motion.base} ${vars.motion.ease}, background-color ${vars.motion.base} ${vars.motion.ease}, transform ${vars.motion.base} ${vars.motion.ease}`,
  selectors: {
    '&:hover:not(:disabled)': {
      borderColor: vars.color.primary,
      background: vars.color.primarySubtle,
    },
    '&:active:not(:disabled)': { transform: 'scale(0.997)' },
    '&:disabled': { cursor: 'wait', opacity: 0.72 },
  },
})

export const dropZoneActive = style([dropZone, {
  borderColor: vars.color.primary,
  background: vars.color.primarySubtle,
}])

export const uploadIcon = style({
  width: 72,
  height: 72,
  display: 'grid',
  placeItems: 'center',
  color: vars.color.primary,
  background: vars.color.primarySubtle,
  borderRadius: vars.radius.full,
  marginBottom: 4,
})

export const uploadTitle = style({ fontSize: '15px', fontWeight: 600 })
export const uploadHint = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.xs })
export const hiddenInput = style({ display: 'none' })

export const panelHeading = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: vars.space.sm,
  margin: '2px 2px 12px',
})

export const sectionTitle = style({ margin: 0, fontSize: vars.fontSize.md, fontWeight: 650 })

export const statusBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  padding: '0 8px',
  borderRadius: vars.radius.full,
  color: vars.color.success,
  background: vars.color.successSubtle,
  fontSize: '11px',
  fontWeight: 600,
})

export const targetMetaRow = style({
  minHeight: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.sm,
  padding: '5px 3px 0',
  color: vars.color.textSecondary,
  fontSize: '11px',
})

export const textButton = style({
  padding: 0,
  color: vars.color.primary,
  background: 'transparent',
  border: 0,
  fontSize: '11px',
  cursor: 'pointer',
  selectors: { '&:hover': { textDecoration: 'underline' } },
})

export const defaultLabel = style({ color: vars.color.success, fontWeight: 600 })

export const interfaceHeading = style({
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  margin: '9px 2px 7px',
  fontSize: '12px',
  fontWeight: 650,
})

export const infoRow = style({
  minHeight: 47,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 9px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  selectors: { '& + &': { marginTop: 5 } },
})

export const infoText = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  flex: 1,
  gap: 2,
})

export const copyButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
  padding: '4px 5px',
  color: vars.color.primary,
  background: 'transparent',
  border: 0,
  borderRadius: vars.radius.sm,
  fontSize: '10px',
  cursor: 'pointer',
  selectors: { '&:hover': { background: vars.color.primarySubtle } },
})

export const inlineLink = style({
  flexShrink: 0,
  color: vars.color.primary,
  fontSize: '10px',
  fontWeight: 600,
  padding: '4px 5px',
})

export const historySection = style({ marginTop: 16 })

export const historyHeader = style({
  minHeight: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.md,
  marginBottom: 8,
})

export const historyTitleWrap = style({ display: 'flex', alignItems: 'center', gap: 8 })
export const historyTitle = style({ margin: 0, fontSize: vars.fontSize.md, fontWeight: 650 })
export const historyCount = style({ color: vars.color.textSecondary, fontSize: '11px' })

export const iconButton = style({
  width: 28,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  color: vars.color.textSecondary,
  background: 'transparent',
  border: 0,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  selectors: { '&:hover': { color: vars.color.primary, background: vars.color.primarySubtle } },
})

export const historyTools = style({ display: 'flex', alignItems: 'center', gap: 8 })

export const viewSwitch = style({
  display: 'flex',
  padding: 2,
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
})

export const viewButton = style({
  width: 29,
  height: 27,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  color: vars.color.textSecondary,
  background: 'transparent',
  border: 0,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
})

export const viewButtonActive = style([viewButton, {
  color: vars.color.primary,
  background: vars.color.primarySubtle,
}])

export const imageGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 10,
  '@media': {
    'screen and (max-width: 1420px)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
    'screen and (max-width: 1180px)': { gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' },
    'screen and (max-width: 960px)': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
    'screen and (max-width: 640px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
    'screen and (max-width: 420px)': { gridTemplateColumns: '1fr' },
  },
})

export const imageList = style({ display: 'grid', gap: 8 })

export const imageCard = style({
  ...card,
  minWidth: 0,
  overflow: 'hidden',
  transition: `border-color ${vars.motion.fast} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { borderColor: vars.color.borderStrong, transform: 'translateY(-1px)' },
  },
})

export const imageCardList = style([imageCard, {
  display: 'grid',
  gridTemplateColumns: '112px minmax(0, 1fr) auto',
  alignItems: 'center',
  paddingRight: 10,
}])

export const thumbLink = style({ display: 'block', background: vars.color.background })
export const thumbLinkList = style([thumbLink, { height: 70 }])

export const imageThumb = style({
  width: '100%',
  aspectRatio: '1.62',
  display: 'block',
  objectFit: 'cover',
  background: vars.color.background,
})

export const imageThumbList = style([imageThumb, { height: '100%', aspectRatio: 'auto' }])

export const imageBody = style({ minWidth: 0, padding: '8px 9px 5px' })

export const imageName = style({
  display: 'block',
  overflow: 'hidden',
  fontSize: '11px',
  fontWeight: 650,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const imageMeta = style({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 5,
  marginTop: 5,
  color: vars.color.textSecondary,
  fontSize: '9px',
})

export const imageActions = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 5,
  padding: '4px 8px 8px',
})

export const actionButton = style({
  minWidth: 30,
  height: 27,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  color: vars.color.textSecondary,
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  selectors: { '&:hover': { color: vars.color.primary, borderColor: vars.color.primary } },
})

export const deleteButton = style([actionButton, {
  color: vars.color.danger,
  selectors: { '&:hover': { color: vars.color.danger, borderColor: vars.color.danger, background: vars.color.dangerSubtle } },
}])

export const historyEmpty = style({
  ...card,
  minHeight: 180,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
})

export const emptyImageIcon = style({
  width: 46,
  height: 46,
  display: 'grid',
  placeItems: 'center',
  color: vars.color.primary,
  background: vars.color.primarySubtle,
  borderRadius: vars.radius.full,
})

export const pager = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 8,
  marginTop: 12,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
})

export const sideColumn = style({
  display: 'grid',
  gap: 16,
  position: 'sticky',
  top: 88,
  '@media': {
    'screen and (max-width: 1180px)': {
      position: 'static',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
    'screen and (max-width: 680px)': { gridTemplateColumns: '1fr' },
  },
})

export const sidePanel = style({ ...card, padding: 14 })
export const sidePanelIcon = style({ color: vars.color.textSecondary })
export const sideLabel = style({ margin: '2px 0 7px', color: vars.color.textSecondary, fontSize: '10px' })

export const targetSummary = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 7px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
})

export const targetSummaryIcon = style({
  width: 34,
  height: 34,
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  color: vars.color.primary,
  background: vars.color.primarySubtle,
  borderRadius: vars.radius.md,
})

export const targetSummaryText = style({
  minWidth: 0,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
})

export const statList = style({ margin: '10px 0 12px' })

export const statRow = style({
  minHeight: 42,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  borderBottom: `1px solid ${vars.color.border}`,
})

export const settingsLink = style({
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  color: vars.color.textSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  fontSize: '11px',
  fontWeight: 550,
  selectors: { '&:hover': { color: vars.color.primary, borderColor: vars.color.primary } },
})

export const tutorialHeading = style({ marginBottom: 10 })

export const steps = style({
  margin: '0 0 12px',
  paddingLeft: 20,
  color: vars.color.textSecondary,
  fontSize: '11px',
  lineHeight: 1.72,
})

export const tutorialLink = style({
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  color: vars.color.primary,
  background: vars.color.primarySubtle,
  borderRadius: vars.radius.md,
  fontSize: '11px',
  fontWeight: 600,
})

export const noTargetPage = style({
  ...card,
  minHeight: 520,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 32,
  textAlign: 'center',
})

export const noTargetIcon = style({
  width: 76,
  height: 76,
  display: 'grid',
  placeItems: 'center',
  marginBottom: 18,
  color: vars.color.primary,
  background: vars.color.primarySubtle,
  borderRadius: vars.radius.full,
})

export const noTargetTitle = style({ margin: 0, fontSize: vars.fontSize.xl, fontWeight: 650 })
export const noTargetHint = style({ maxWidth: 480, margin: '9px 0 20px', color: vars.color.textSecondary, lineHeight: 1.65 })
export const primaryLink = style({
  height: 38,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '0 16px',
  color: vars.color.textOnPrimary,
  background: vars.color.primary,
  borderRadius: vars.radius.md,
  fontWeight: 600,
})

// 匿名上传页仍复用的轻量布局样式。
export const error = style({ color: vars.color.danger, fontSize: vars.fontSize.sm })
export const row = style({ display: 'flex', alignItems: 'center', gap: vars.space.sm })
export const actionBtn = actionButton

globalStyle(`${infoText} > span`, { color: vars.color.textSecondary, fontSize: '10px' })
globalStyle(`${infoText} > strong`, {
  overflow: 'hidden',
  color: vars.color.textSecondary,
  fontSize: '11px',
  fontWeight: 500,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})
globalStyle(`${imageMeta} > span:nth-child(2)`, { display: 'none' })
globalStyle(`${historyEmpty} > strong`, { color: vars.color.text, fontWeight: 600 })
globalStyle(`${targetSummaryText} > strong`, {
  overflow: 'hidden',
  fontSize: '11px',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})
globalStyle(`${targetSummaryText} > span`, { color: vars.color.textSecondary, fontSize: '9px' })
globalStyle(`${statRow} dt`, { color: vars.color.textSecondary, fontSize: '11px' })
globalStyle(`${statRow} dd`, {
  margin: 0,
  color: vars.color.text,
  fontSize: '16px',
  fontWeight: 650,
  letterSpacing: '-0.02em',
})
globalStyle(`${steps} li + li`, { marginTop: 6 })
globalStyle(`${steps} li::marker`, { color: vars.color.primary, fontWeight: 700 })
