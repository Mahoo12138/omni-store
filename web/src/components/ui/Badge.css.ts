import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

const base = style({
  display: 'inline-flex',
  alignItems: 'center',
  height: '22px',
  padding: `0 ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  whiteSpace: 'nowrap',
})

export const badge = styleVariants({
  // 读写
  blue: [base, { background: vars.color.primarySubtle, color: vars.color.primarySubtleInk }],
  // 只读 / WebDAV
  gray: [base, { background: 'oklch(0.945 0.005 262)', color: vars.color.textSecondary }],
  // 公开 / 成功
  green: [base, { background: vars.color.successSubtle, color: 'oklch(0.42 0.12 150)' }],
  // 图床
  purple: [base, { background: vars.color.tilePurpleBg, color: vars.color.tilePurpleFg }],
  // 失败 / 危险
  red: [base, { background: vars.color.dangerSubtle, color: vars.color.danger }],
})
