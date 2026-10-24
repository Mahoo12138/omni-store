import type { ReactNode } from 'react'
import { Toaster, useToastController } from '@fluentui/react-components'
import type { ToastIntent } from '@fluentui/react-components'
import * as css from './Toast.css'

export const appStatusToastID = 'app-status'

// Fluent Toaster 的控制器单例：AppToaster 挂载时捕获，供组件外的模块级通知函数使用。
type ToastController = ReturnType<typeof useToastController>
let controller: ToastController | null = null

// app-status 状态位的存活跟踪：dispatch 同 id 不会刷新已渲染内容，
// 存活时必须走 updateToast（内部 updateId++ 触发重渲染并重启计时）。
let statusAlive = false

function notice(message: ReactNode, intent: ToastIntent) {
  if (!controller) return
  if (statusAlive) {
    controller.updateToast({ content: message, toastId: appStatusToastID, timeout: 5000, intent })
    return
  }
  statusAlive = true
  controller.dispatchToast(message, {
    toastId: appStatusToastID,
    timeout: 5000,
    intent,
    // 通知卡自带 live 语义，传入 announce 关闭 Fluent 的 AriaLive 文本镜像
    onStatusChange: (_, data) => {
      if (data.status === 'dismissed' || data.status === 'unmounted') statusAlive = false
    },
  })
}

export function toastSuccess(message: ReactNode) {
  return notice(message, 'success')
}

export function toastError(message: ReactNode) {
  return notice(message, 'error')
}

export function toastInfo(message: ReactNode) {
  return notice(message, 'info')
}

/**
 * 应用级通知容器：所有页面通知统一从右下角出现，避免把状态信息插进页面布局。
 */
export function AppToaster() {
  controller = useToastController()
  return <Toaster position="bottom-end" offset={{ horizontal: 24, vertical: 24 }} announce={() => undefined} />
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
