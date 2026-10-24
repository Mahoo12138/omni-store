import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// 通知卡样式：容器已迁移到 Fluent Toaster（bottom-end, limit 4），
// 卡片内容仍是自定义 JSX，沿用原视觉。移动端避让底部导航的偏移在页面批次统一处理。
export const notice = style({
  width: 'min(360px, calc(100vw - 32px))',
  padding: `${vars.space.sm} ${vars.space.md}`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.md,
  backgroundColor: vars.color.surface,
  color: vars.color.text,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.5,
})

export const success = style({
  borderColor: 'oklch(0.82 0.12 150)',
  color: vars.color.success,
})

export const error = style({
  borderColor: 'oklch(0.82 0.12 27)',
  color: vars.color.danger,
})

export const info = style({
  borderColor: vars.color.borderStrong,
  color: vars.color.primarySubtleInk,
})

// 常驻任务卡层：与通知 Toaster 同区域（右下角），向上堆叠；层本身不拦截交互，卡自身恢复
export const taskLayer = style({
  position: 'fixed',
  right: 24,
  bottom: 24,
  zIndex: vars.zIndex.toast,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: vars.space.sm,
  pointerEvents: 'none',
  maxWidth: 'min(420px, calc(100vw - 32px))',
})

globalStyle(`${taskLayer} > *`, {
  pointerEvents: 'auto',
})
