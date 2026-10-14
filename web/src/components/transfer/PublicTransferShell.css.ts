import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'
import * as publicEntry from '../../pages/AnonymousUpload.css'

// Public entry pages share their masthead, hero proportions and overlapping stage.
export const page = publicEntry.page
export const hero = publicEntry.hero
export const masthead = publicEntry.masthead
export const brand = style([publicEntry.brand, { minWidth: 0, maxWidth: '100%', selectors: { '&:focus-visible': { outline: `2px solid ${vars.color.surface}`, outlineOffset: 3 } } }])
export const heroBody = publicEntry.heroBody
export const stage = publicEntry.workbenchStage

export const brandLogo = style({ width: 32, height: 32, flexShrink: 0 })
export const brandCopy = style({ minWidth: 0 })
export const brandName = style({ maxWidth: '28ch', overflowWrap: 'anywhere' })
export const heroCopy = style({ minWidth: 0, maxWidth: '660px', overflowWrap: 'anywhere' })
globalStyle(`${heroCopy} h1`, { margin: 0, color: vars.color.surface, fontSize: 48, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em', textWrap: 'balance' })
globalStyle(`${heroCopy} p`, { maxWidth: '52ch', margin: `${vars.space.md} 0 0`, color: `color-mix(in oklch, ${vars.color.surface} 72%, transparent)`, fontSize: vars.fontSize.lg, lineHeight: 1.65, textWrap: 'pretty' })

export const workbench = style({
  minWidth: 0,
  padding: `${vars.space.xl} 48px`,
  borderRadius: vars.radius.lg,
  background: vars.color.surface,
  boxShadow: vars.shadow.md,
  '@media': {
    'screen and (max-width: 900px)': { padding: vars.space.xl },
    'screen and (max-width: 640px)': { padding: vars.space.lg },
    'screen and (max-width: 480px)': { padding: vars.space.md },
  },
})
