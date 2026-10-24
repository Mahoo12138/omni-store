import { style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// 弹层外壳已迁移到 DialogWrap，这里只保留二维码与链接文本样式。
export const qrWrap = style({
  display: 'flex',
  justifyContent: 'center',
  padding: vars.space.md,
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
})

export const urlText = style({
  margin: `${vars.space.md} 0 0`,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  overflowWrap: 'anywhere',
})
