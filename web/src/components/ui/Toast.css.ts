import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../../styles/theme.css'

// 通知卡已迁移到 Fluent Toast 原生外观（intent 驱动）；这里只保留常驻任务卡层。
// 任务卡层：与通知 Toaster 同区域（右下角），向上堆叠；层本身不拦截交互，卡自身恢复
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
