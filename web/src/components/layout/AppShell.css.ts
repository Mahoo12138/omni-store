import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

export const shell = style({
  minHeight: '100dvh',
  display: 'flex',
  background: vars.color.background,
  '@media': { 'screen and (max-width: 820px)': { flexDirection: 'column' } },
})

export const sidebar = style({
  width: '224px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: vars.color.surface,
  borderRight: `1px solid ${vars.color.border}`,
  padding: '20px 16px 18px',
  position: 'sticky',
  top: 0,
  height: '100dvh',
  zIndex: vars.zIndex.sticky,
  '@media': {
    'screen and (max-width: 820px)': {
      width: '100%', height: 'auto', position: 'fixed', top: 'auto', right: 0, bottom: 0, left: 0,
      flexDirection: 'row', alignItems: 'center', gap: vars.space.xs,
      borderRight: 'none', borderTop: `1px solid ${vars.color.border}`,
      padding: `6px 8px max(6px, env(safe-area-inset-bottom))`, overflow: 'visible',
    },
  },
})

export const brand = style({
  display: 'flex', alignItems: 'center', gap: '10px', color: vars.color.primary,
  fontSize: '18px', fontWeight: 700, letterSpacing: '-0.035em', padding: '2px 8px 32px',
  '@media': { 'screen and (max-width: 820px)': { display: 'none' } },
})
export const brandName = style({ color: vars.color.text })

export const nav = style({
  display: 'flex', flexDirection: 'column', gap: '6px',
  '@media': { 'screen and (max-width: 820px)': { width: '100%', flexDirection: 'row', flex: 1, gap: vars.space.xs } },
})
export const navLink = style({
  minHeight: 44, display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 13px', borderRadius: vars.radius.md,
  color: vars.color.textSecondary, fontSize: vars.fontSize.md, fontWeight: 500, whiteSpace: 'nowrap',
  transition: `background-color ${vars.motion.base} ${vars.motion.ease}, color ${vars.motion.base} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover, color: vars.color.text },
    '&:active': { transform: 'translateY(1px)' },
    '&:focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
  },
  '@media': {
    'screen and (max-width: 820px)': {
      minWidth: 0, minHeight: 52, flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 2,
      padding: '5px 4px', fontSize: vars.fontSize.xs,
    },
  },
})
export const navLinkActive = style([navLink, {
  backgroundColor: vars.color.primarySubtle, color: vars.color.primary,
  selectors: { '&:hover': { backgroundColor: vars.color.primarySubtle, color: vars.color.primary } },
}])
export const sidebarSpacer = style({ flex: 1, '@media': { 'screen and (max-width: 820px)': { display: 'none' } } })

export const content = style({
  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
  '@media': { 'screen and (max-width: 820px)': { paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' } },
})
export const userMenu = style({
  width: '100%', position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0,
  paddingTop: 12, borderTop: `1px solid ${vars.color.border}`,
  '@media': { 'screen and (max-width: 820px)': { width: 'auto', paddingTop: 0, borderTop: 0 } },
})
export const userMenuBtn = style({
  width: '100%', minHeight: 52, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px',
  background: 'none', border: 'none', borderRadius: vars.radius.md, cursor: 'pointer', color: vars.color.text,
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover },
    '&:active': { transform: 'translateY(1px)' },
    '&:focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: 2 },
  },
  '@media': {
    'screen and (max-width: 820px)': {
      width: 52, minHeight: 52, justifyContent: 'center', padding: 4,
    },
  },
})
export const avatar = style({
  width: 34, height: 34, borderRadius: vars.radius.md, backgroundColor: vars.color.primarySubtle, color: vars.color.primary,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: vars.fontSize.sm, fontWeight: 600, flexShrink: 0,
})
export const userIdentity = style({
  minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
  '@media': { 'screen and (max-width: 820px)': { display: 'none' } },
})
export const userName = style({
  maxWidth: '100%', overflow: 'hidden', color: vars.color.text, fontSize: vars.fontSize.sm,
  fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap',
})
export const userCaption = style({ color: vars.color.textSecondary, fontSize: vars.fontSize.xs })
export const userChevron = style({
  flexShrink: 0, color: vars.color.textSecondary, transition: `transform ${vars.motion.fast} ${vars.motion.ease}`,
  '@media': { 'screen and (max-width: 820px)': { display: 'none' } },
})
globalStyle(`${userMenuBtn}[aria-expanded='true'] ${userChevron}`, { transform: 'rotate(180deg)' })
export const userDropdown = style({
  position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, minWidth: 200, backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.lg, boxShadow: vars.shadow.sm, padding: 6, zIndex: vars.zIndex.dropdown,
  '@media': { 'screen and (max-width: 820px)': { right: 0, left: 'auto' } },
})
export const userDropdownItem = style({
  minHeight: 40, display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', background: 'none', border: 'none',
  borderRadius: vars.radius.md, color: vars.color.text, fontSize: vars.fontSize.md, cursor: 'pointer', textAlign: 'left',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover },
    '&:focus-visible': { outline: `2px solid ${vars.color.primary}`, outlineOffset: -2 },
  },
})
export const userDropdownDivider = style({ height: 1, backgroundColor: vars.color.border, margin: '4px 0' })
export const main = style({
  flex: 1, width: '100%', maxWidth: '1360px', margin: '0 auto', padding: '48px clamp(24px, 4vw, 64px) 64px',
  '@media': { 'screen and (max-width: 820px)': { padding: '32px 18px 48px' }, 'screen and (max-width: 480px)': { padding: '24px 14px 40px' } },
})
export const mainWide = style([main, {
  maxWidth: '1600px',
  padding: '20px clamp(20px, 2vw, 32px) 48px',
  '@media': { 'screen and (max-width: 820px)': { padding: '24px 18px 42px' }, 'screen and (max-width: 480px)': { padding: '20px 14px 36px' } },
}])

const pulse = keyframes({ '0%, 100%': { opacity: .5 }, '50%': { opacity: .85 } })
export const loadingShell = style({ minHeight: '100dvh', display: 'grid', gridTemplateColumns: '224px 1fr', background: vars.color.background, '@media': { 'screen and (max-width: 820px)': { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' } } })
export const loadingSidebar = style({
  background: vars.color.surface, borderRight: `1px solid ${vars.color.border}`,
  '@media': {
    'screen and (max-width: 820px)': {
      height: 64, position: 'fixed', right: 0, bottom: 0, left: 0,
      borderRight: 0, borderTop: `1px solid ${vars.color.border}`,
    },
  },
})
export const loadingContent = style({ padding: 32, '@media': { 'screen and (max-width: 820px)': { padding: `${vars.space.lg} ${vars.space.lg} 88px` } } })
export const loadingBar = style({ height: 18, width: 120, borderRadius: 5, background: vars.color.border, animation: `${pulse} 1.2s ease-in-out infinite` })
export const loadingBlock = style({ height: 260, marginTop: 64, borderRadius: vars.radius.lg, background: vars.color.surfaceHover, animation: `${pulse} 1.2s ease-in-out infinite` })
