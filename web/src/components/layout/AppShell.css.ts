import { keyframes, style } from '@vanilla-extract/css'
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
      width: '100%', height: 'auto', position: 'sticky', flexDirection: 'row', alignItems: 'center',
      gap: vars.space.sm, borderRight: 'none', borderBottom: `1px solid ${vars.color.border}`,
      padding: '10px 14px', overflowX: 'auto',
    },
  },
})

export const brand = style({
  display: 'flex', alignItems: 'center', gap: '10px', color: vars.color.primary,
  fontSize: '18px', fontWeight: 700, letterSpacing: '-0.035em', padding: '2px 8px 32px',
  '@media': { 'screen and (max-width: 820px)': { padding: 0, marginRight: vars.space.sm } },
})
export const brandName = style({ color: vars.color.text, '@media': { 'screen and (max-width: 480px)': { display: 'none' } } })

export const nav = style({
  display: 'flex', flexDirection: 'column', gap: '6px',
  '@media': { 'screen and (max-width: 820px)': { flexDirection: 'row', flex: 1 } },
})
export const navLink = style({
  minHeight: 44, display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 13px', borderRadius: vars.radius.md,
  color: vars.color.textSecondary, fontSize: vars.fontSize.md, fontWeight: 500, whiteSpace: 'nowrap',
  transition: `background-color ${vars.motion.base} ${vars.motion.ease}, color ${vars.motion.base} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.surfaceHover, color: vars.color.text },
    '&:active': { transform: 'translateY(1px)' },
  },
})
export const navLinkActive = style([navLink, {
  backgroundColor: vars.color.primarySubtle, color: vars.color.primary,
  selectors: { '&:hover': { backgroundColor: vars.color.primarySubtle, color: vars.color.primary } },
}])
export const sidebarSpacer = style({ flex: 1, '@media': { 'screen and (max-width: 820px)': { display: 'none' } } })
export const sidebarMeta = style({
  display: 'flex', flexDirection: 'column', gap: '3px', padding: '14px 10px 2px',
  borderTop: `1px solid ${vars.color.border}`, color: vars.color.textSecondary, fontSize: vars.fontSize.xs,
  '@media': { 'screen and (max-width: 820px)': { display: 'none' } },
})
export const mobileUser = style({
  display: 'none', border: 0, background: 'transparent', color: vars.color.textSecondary, cursor: 'pointer',
  '@media': { 'screen and (max-width: 820px)': { width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: vars.radius.md } },
})

export const content = style({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' })
export const topbar = style({
  display: 'flex', alignItems: 'center', gap: vars.space.md, height: '68px', padding: '0 32px',
  backgroundColor: 'oklch(1 0 0 / 0.88)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${vars.color.border}`,
  position: 'sticky', top: 0, zIndex: vars.zIndex.sticky,
  '@media': { 'screen and (max-width: 820px)': { display: 'none' } },
})
export const topbarTitle = style({ fontSize: vars.fontSize.lg, fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '-0.02em' })
export const topbarSpacer = style({ flex: 1 })
export const helpLink = style({
  display: 'inline-flex', alignItems: 'center', gap: 7, color: vars.color.textSecondary, fontSize: vars.fontSize.sm,
  padding: '8px 10px', borderRadius: vars.radius.md, transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: { '&:hover': { color: vars.color.text, background: vars.color.surfaceHover } },
})
export const userMenu = style({ display: 'flex', alignItems: 'center', gap: vars.space.sm, flexShrink: 0 })
export const userMenuBtn = style({
  minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: vars.space.sm, padding: '4px 9px 4px 4px',
  background: 'none', border: 'none', borderRadius: vars.radius.md, cursor: 'pointer', color: vars.color.text,
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, transform ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: { '&:hover': { backgroundColor: vars.color.surfaceHover }, '&:active': { transform: 'translateY(1px)' } },
})
export const avatar = style({
  width: 32, height: 32, borderRadius: vars.radius.md, backgroundColor: vars.color.primarySubtle, color: vars.color.primary,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: vars.fontSize.sm, fontWeight: 600, flexShrink: 0,
})
export const userName = style({ fontSize: vars.fontSize.md, fontWeight: 500, '@media': { 'screen and (max-width: 1024px)': { display: 'none' } } })
export const userDropdown = style({
  position: 'absolute', top: 'calc(100% + 7px)', right: 0, minWidth: 200, backgroundColor: vars.color.surface,
  border: `1px solid ${vars.color.border}`, borderRadius: vars.radius.lg, boxShadow: vars.shadow.md, padding: 6, zIndex: vars.zIndex.dropdown,
})
export const userDropdownItem = style({
  minHeight: 40, display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', background: 'none', border: 'none',
  borderRadius: vars.radius.md, color: vars.color.text, fontSize: vars.fontSize.md, cursor: 'pointer', textAlign: 'left',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: { '&:hover': { backgroundColor: vars.color.surfaceHover } },
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
export const loadingShell = style({ minHeight: '100dvh', display: 'grid', gridTemplateColumns: '224px 1fr', background: vars.color.background, '@media': { 'screen and (max-width: 820px)': { gridTemplateColumns: '1fr', gridTemplateRows: '64px 1fr' } } })
export const loadingSidebar = style({ background: vars.color.surface, borderRight: `1px solid ${vars.color.border}`, '@media': { 'screen and (max-width: 820px)': { borderRight: 0, borderBottom: `1px solid ${vars.color.border}` } } })
export const loadingContent = style({ padding: 32, '@media': { 'screen and (max-width: 820px)': { padding: vars.space.lg } } })
export const loadingBar = style({ height: 18, width: 120, borderRadius: 5, background: vars.color.border, animation: `${pulse} 1.2s ease-in-out infinite` })
export const loadingBlock = style({ height: 260, marginTop: 64, borderRadius: vars.radius.lg, background: vars.color.surfaceHover, animation: `${pulse} 1.2s ease-in-out infinite` })
