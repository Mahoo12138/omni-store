import { globalKeyframes, globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../styles/theme.css'

// 统一预览层样式（1.2.0）：文件管理器弹层与分享页内嵌共用同一套渲染器。

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: vars.zIndex.modal,
  background: 'oklch(0.2 0.03 258 / 0.72)',
  display: 'flex',
  flexDirection: 'column',
  backdropFilter: 'blur(4px)',
})

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  padding: `${vars.space.sm} ${vars.space.md}`,
  color: vars.color.textOnPrimary,
  flexWrap: 'wrap',
})

export const headerInfo = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  flex: '1 1 auto',
})

export const headerTitle = style({
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

export const headerMeta = style({
  fontSize: vars.fontSize.xs,
  opacity: 0.72,
  marginTop: 2,
})

export const headerBtn = style({
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  color: vars.color.textOnPrimary,
  borderRadius: vars.radius.sm,
  padding: vars.space.sm,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  cursor: 'pointer',
  fontSize: vars.fontSize.sm,
  textDecoration: 'none',
  ':hover': { background: 'oklch(1 0 0 / 0.14)' },
  ':focus-visible': { outline: `2px solid ${vars.color.textOnPrimary}`, outlineOffset: 2 },
  ':disabled': { opacity: 0.35, cursor: 'not-allowed' },
})

export const body = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: vars.space.md,
  overflow: 'auto',
})

// 内嵌模式（分享文件页）：不整屏遮罩，只渲染内容区。
export const embedded = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
})

export const stage = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 0,
})

export const image = style({
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.md,
  background: vars.color.surface,
  cursor: 'zoom-in',
})

export const zoomBtn = style({
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  padding: 0,
  display: 'block',
  maxWidth: '100%',
  maxHeight: '100%',
  cursor: 'zoom-in',
  ':focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
})

export const pdfFrame = style({
  width: '100%',
  height: '100%',
  minHeight: '70vh',
  border: 'none',
  borderRadius: vars.radius.md,
  background: vars.color.surface,
})

export const media = style({
  maxWidth: 'min(920px, 100%)',
  width: '100%',
  borderRadius: vars.radius.md,
  background: 'oklch(0.18 0.02 258)',
  boxShadow: vars.shadow.md,
  ':focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
})

export const audio = style({
  maxWidth: 'min(560px, 100%)',
  width: '100%',
})

export const textWrap = style({
  width: '100%',
  maxWidth: '980px',
  margin: '0 auto',
  maxHeight: '100%',
  overflow: 'auto',
  background: vars.color.surface,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.sm,
})

export const textPre = style({
  margin: 0,
  padding: vars.space.md,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.6,
  whiteSpace: 'pre',
  overflowWrap: 'normal',
  tabSize: 4,
  color: vars.color.text,
  minHeight: '100%',
})

export const truncatedBar = style({
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  background: vars.color.primarySubtle,
  borderRadius: `${vars.radius.md} ${vars.radius.md} 0 0`,
})

export const fallbackCard = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.md,
  background: vars.color.surface,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.md,
  padding: `${vars.space.xl} ${vars.space.lg}`,
  maxWidth: '380px',
  textAlign: 'center',
})

export const fallbackIcon = style({
  width: 64,
  height: 64,
  borderRadius: vars.radius.tile,
  background: vars.color.tileBlueBg,
  color: vars.color.tileBlueFg,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
})

export const fallbackTitle = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  color: vars.color.text,
})

export const fallbackHint = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  wordBreak: 'break-all',
})

export const stateBox = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.md,
  color: vars.color.textOnPrimary,
  fontSize: vars.fontSize.sm,
})

export const spinner = style({
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '3px solid oklch(1 0 0 / 0.25)',
  borderTopColor: vars.color.textOnPrimary,
  animation: `omnistore-preview-spin 0.9s linear infinite`,
})

export const retryBtn = style({
  appearance: 'none',
  border: 'none',
  background: 'oklch(1 0 0 / 0.16)',
  color: vars.color.textOnPrimary,
  borderRadius: vars.radius.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  cursor: 'pointer',
  fontSize: vars.fontSize.sm,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  ':hover': { background: 'oklch(1 0 0 / 0.26)' },
  ':focus-visible': { outline: `2px solid ${vars.color.textOnPrimary}`, outlineOffset: 2 },
})

export const downloadBtn = style({
  appearance: 'none',
  border: 'none',
  background: vars.color.primary,
  color: vars.color.textOnPrimary,
  borderRadius: vars.radius.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  cursor: 'pointer',
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  textDecoration: 'none',
  ':hover': { background: vars.color.primaryHover },
  ':focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
})

export const navBtn = style({
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  padding: vars.space.xs,
  borderRadius: vars.radius.sm,
  display: 'inline-flex',
  ':hover': { background: 'oklch(1 0 0 / 0.14)' },
  ':focus-visible': { outline: `2px solid ${vars.color.textOnPrimary}`, outlineOffset: 2 },
  ':disabled': { opacity: 0.35, cursor: 'not-allowed' },
})

// —— Markdown 渲染排版 ——
// 容器样式 + 稳定全局类名 omnistore-markdown（排版经 globalStyle 定义，见文件底部）。
export const markdown = style({
  width: '100%',
  maxWidth: '980px',
  margin: '0 auto',
  maxHeight: '100%',
  overflow: 'auto',
  background: vars.color.surface,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.sm,
  padding: vars.space.lg,
  color: vars.color.text,
  fontSize: vars.fontSize.md,
  lineHeight: 1.75,
  boxSizing: 'border-box',
})

// —— 代码高亮 ——
export const codeLineNo = style({
  display: 'inline-block',
  width: '2.6em',
  marginRight: vars.space.md,
  textAlign: 'right',
  userSelect: 'none',
  opacity: 0.4,
})

// —— 画廊 ——
export const gallery = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: vars.space.sm,
  width: '100%',
})

export const galleryItem = style({
  appearance: 'none',
  border: 'none',
  padding: 0,
  background: vars.color.surface,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  cursor: 'zoom-in',
  aspectRatio: '1 / 1',
  boxShadow: vars.shadow.sm,
  ':hover': { boxShadow: vars.shadow.md },
  ':focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
})

export const galleryImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  backgroundColor: vars.color.surfaceHover,
})

export const galleryName = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  padding: `${vars.space.xl} ${vars.space.xs} ${vars.space.xs}`,
  fontSize: vars.fontSize.xs,
  color: '#fff',
  textAlign: 'left',
  background: 'linear-gradient(transparent, oklch(0.2 0.03 258 / 0.7))',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

export const galleryCell = style({
  position: 'relative',
})

// 全局 keyframes
globalKeyframes('omnistore-preview-spin', {
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
})

export const viewToggle = style({
  display: 'inline-flex',
  gap: 2,
  background: vars.color.surfaceHover,
  borderRadius: vars.radius.full,
  padding: 2,
})

export const viewOption = style({
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  borderRadius: vars.radius.full,
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  color: vars.color.textSecondary,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  ':focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
})

export const viewOptionActive = style({
  background: vars.color.surface,
  color: vars.color.text,
  boxShadow: vars.shadow.sm,
})

// —— Prism token 配色（浅底，CodeBlock 独立渲染与 Markdown 内代码共用 token 色板） ——
const prismInk = {
  comment: 'oklch(0.52 0.02 258)',
  string: 'oklch(0.5 0.12 150)',
  number: 'oklch(0.55 0.12 60)',
  keyword: 'oklch(0.45 0.19 275)',
  function: 'oklch(0.45 0.11 210)',
  tag: 'oklch(0.5 0.18 27)',
  operator: 'oklch(0.42 0.09 257)',
}
globalStyle('.omnistore-prism', {
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.6,
  margin: 0,
  padding: vars.space.md,
  whiteSpace: 'pre',
  overflow: 'auto',
  minHeight: '100%',
  boxSizing: 'border-box',
})
globalStyle('.omnistore-prism .token.comment, .omnistore-prism .token.prolog, .omnistore-prism .token.doctype, .omnistore-prism .token.cdata', { color: prismInk.comment, fontStyle: 'italic' })
globalStyle('.omnistore-prism .token.punctuation', { color: vars.color.textSecondary })
globalStyle('.omnistore-prism .token.string, .omnistore-prism .token.char, .omnistore-prism .token.attr-value, .omnistore-prism .token.inserted', { color: prismInk.string })
globalStyle('.omnistore-prism .token.boolean, .omnistore-prism .token.number, .omnistore-prism .token.constant', { color: prismInk.number })
globalStyle('.omnistore-prism .token.keyword, .omnistore-prism .token.atrule', { color: prismInk.keyword })
globalStyle('.omnistore-prism .token.function, .omnistore-prism .token.class-name', { color: prismInk.function })
globalStyle('.omnistore-prism .token.tag, .omnistore-prism .token.deleted', { color: prismInk.tag })
globalStyle('.omnistore-prism .token.operator, .omnistore-prism .token.entity, .omnistore-prism .token.url', { color: prismInk.operator, background: 'transparent' })
globalStyle('.omnistore-prism .token.attr-name, .omnistore-prism .token.selector', { color: prismInk.keyword })

// —— Markdown 排版（稳定类名 .omnistore-markdown，由 globalStyle 定义后代选择器） ——
globalStyle('.omnistore-markdown h1, .omnistore-markdown h2, .omnistore-markdown h3, .omnistore-markdown h4, .omnistore-markdown h5, .omnistore-markdown h6', { color: vars.color.text, margin: '1.4em 0 0.6em', lineHeight: 1.35 })
globalStyle('.omnistore-markdown h1:first-child, .omnistore-markdown h2:first-child', { marginTop: 0 })
globalStyle('.omnistore-markdown h1', { fontSize: vars.fontSize.xxl })
globalStyle('.omnistore-markdown h2', { fontSize: vars.fontSize.xl, borderBottom: `1px solid ${vars.color.border}`, paddingBottom: vars.space.xs })
globalStyle('.omnistore-markdown h3', { fontSize: vars.fontSize.lg })
globalStyle('.omnistore-markdown p', { margin: '0.7em 0' })
globalStyle('.omnistore-markdown a', { color: vars.color.primary, textDecoration: 'underline', textUnderlineOffset: '3px' })
globalStyle('.omnistore-markdown img', { maxWidth: '100%', borderRadius: vars.radius.sm })
globalStyle('.omnistore-markdown code', { fontFamily: vars.font.mono, fontSize: vars.fontSize.sm, background: vars.color.primarySubtle, borderRadius: vars.radius.sm, padding: '1px 5px' })
globalStyle('.omnistore-markdown pre', { background: 'oklch(0.24 0.03 258)', color: 'oklch(0.93 0.01 258)', borderRadius: vars.radius.md, padding: vars.space.md, overflow: 'auto', fontSize: vars.fontSize.sm, lineHeight: 1.6 })
globalStyle('.omnistore-markdown pre code', { background: 'transparent', padding: 0, color: 'inherit' })
globalStyle('.omnistore-markdown blockquote', { margin: '0.8em 0', padding: `${vars.space.xs} ${vars.space.md}`, borderLeft: `3px solid ${vars.color.borderStrong}`, color: vars.color.textSecondary })
globalStyle('.omnistore-markdown table', { borderCollapse: 'collapse', width: '100%', margin: '0.8em 0', fontSize: vars.fontSize.sm })
globalStyle('.omnistore-markdown th, .omnistore-markdown td', { border: `1px solid ${vars.color.border}`, padding: `${vars.space.xs} ${vars.space.sm}`, textAlign: 'left' })
globalStyle('.omnistore-markdown th', { background: vars.color.surfaceHover })
globalStyle('.omnistore-markdown hr', { border: 'none', borderTop: `1px solid ${vars.color.border}`, margin: '1.2em 0' })
globalStyle('.omnistore-markdown ul, .omnistore-markdown ol', { paddingLeft: '1.5em', margin: '0.6em 0' })
globalStyle('.omnistore-markdown li', { margin: '0.25em 0' })
