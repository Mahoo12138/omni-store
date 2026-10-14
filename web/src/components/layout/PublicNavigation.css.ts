import { createVar, globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

const foreground = createVar()
const border = createVar()
const background = createVar()
const hoverBorder = createVar()
const hoverBackground = createVar()
const selectedBorder = createVar()
const selectedBackground = createVar()

export const navigation = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  gap: '6px',
  minWidth: 0,
  '@media': {
    'screen and (max-width: 900px)': { flexBasis: '100%', justifyContent: 'flex-start' },
  },
})

export const dark = style({ vars: {
  [foreground]: vars.color.surface,
  [border]: `color-mix(in oklch, ${vars.color.surface} 22%, transparent)`,
  [background]: `color-mix(in oklch, ${vars.color.surface} 6%, transparent)`,
  [hoverBorder]: `color-mix(in oklch, ${vars.color.surface} 42%, transparent)`,
  [hoverBackground]: `color-mix(in oklch, ${vars.color.surface} 11%, transparent)`,
  [selectedBorder]: `color-mix(in oklch, ${vars.color.surface} 65%, transparent)`,
  [selectedBackground]: `color-mix(in oklch, ${vars.color.surface} 16%, transparent)`,
} })

export const light = style({ vars: {
  [foreground]: vars.color.text,
  [border]: vars.color.borderStrong,
  [background]: vars.color.surface,
  [hoverBorder]: vars.color.primary,
  [hoverBackground]: vars.color.primarySubtle,
  [selectedBorder]: vars.color.primary,
  [selectedBackground]: vars.color.primarySubtle,
} })

export const link = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  gap: '6px',
  height: 32,
  padding: '0 10px',
  border: `1px solid ${border}`,
  borderRadius: vars.radius.sm,
  background,
  color: foreground,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  transition: `background-color ${vars.motion.fast} ${vars.motion.ease}, border-color ${vars.motion.fast} ${vars.motion.ease}`,
  selectors: {
    '&:hover': { background: hoverBackground, borderColor: hoverBorder },
    '&[aria-current="page"]': { background: selectedBackground, borderColor: selectedBorder },
    '&:focus-visible': { outline: `2px solid ${foreground}`, outlineOffset: 3 },
  },
})

globalStyle(`${link} svg`, { flexShrink: 0 })
export const accountPending = style({ cursor: 'wait' })
