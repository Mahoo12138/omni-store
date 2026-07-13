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

globalStyle('h1, h2, h3', {
  textWrap: 'balance',
})

globalStyle(':focus-visible', {
  outline: `2px solid ${vars.color.primary}`,
  outlineOffset: '2px',
})

// 尊重减少动效偏好：全站动效退化为即时切换。
globalStyle('*, *::before, *::after', {
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
      animationDuration: '0.01ms',
    },
  },
})
