import { globalStyle } from '@vanilla-extract/css'
import { vars } from './theme.css'

globalStyle('*, *::before, *::after', {
  boxSizing: 'border-box',
})

globalStyle('body', {
  margin: 0,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.md,
  color: vars.color.text,
  backgroundColor: vars.color.background,
  WebkitFontSmoothing: 'antialiased',
})

globalStyle('a', {
  color: vars.color.primary,
  textDecoration: 'none',
})
