import type { ReactNode } from 'react'
import { Toaster, useToastController } from '@fluentui/react-components'
import * as css from './Toast.css'

export const appStatusToastID = 'app-status'

// Fluent Toaster 的控制器单例：AppToaster 挂载时捕获，供组件外的模块级通知函数使用。
type ToastController = ReturnType<typeof useToastController>
let controller: ToastController | null = null

// app-status 状态位的存活跟踪：dispatch 同 id 不会刷新已渲染内容，
// 存活时必须走 updateToast（内部 updateId++ 触发重渲染并重启计时）。
let statusAlive = false

function notice(message: ReactNode, className: string, role: 'status' | 'alert') {
  if (!controller) return
  const content = <div className={`${css.notice} ${className}`} role={role}>{message}</div>
  if (statusAlive) {
    controller.updateToast({ content, toastId: appStatusToastID, timeout: 5000 })
    return
  }
  statusAlive = true
  controller.dispatchToast(content, {
    toastId: appStatusToastID,
    timeout: 5000,
    onStatusChange: (_, data) => {
      if (data.status === 'dismissed' || data.status === 'unmounted') statusAlive = false
    },
  })
}

export function toastSuccess(message: ReactNode) {
  return notice(message, css.success, 'status')
}

export function toastError(message: ReactNode) {
  return notice(message, css.error, 'alert')
}

export function toastInfo(message: ReactNode) {
  return notice(message, css.info, 'status')
}

/**
 * 应用级通知容器：所有页面通知统一从右下角出现，避免把状态信息插进页面布局。
 * 通知卡自带 role=status/alert 的 live 语义，传入 announce 关闭 Fluent 的
 * AriaLive 文本镜像（避免内容对 getByText/getByRole 出现两份）。
 */
export function AppToaster() {
  controller = useToastController()
  return <Toaster position="bottom-end" limit={4} offset={{ horizontal: 24, vertical: 24 }} announce={() => undefined} />
}

// 常驻任务卡（上传/粘贴/批量删除）不走 Toaster：其 CollapseDelayed 高度动画的
// 结束态不追踪内容变高，进度卡会溢出视口。改为独立 fixed 层，由 Host 组件 portal 渲染。
let taskLayer: HTMLDivElement | null = null

export function getTaskToastLayer(): HTMLDivElement {
  if (!taskLayer) {
    taskLayer = document.createElement('div')
    taskLayer.className = css.taskLayer
    document.body.appendChild(taskLayer)
  }
  return taskLayer
}
