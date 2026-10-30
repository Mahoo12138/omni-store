import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FluentProvider, Toaster, useToastController } from '@fluentui/react-components'
import type { ToastIntent } from '@fluentui/react-components'
import { layout } from '../../styles/layout'
import { useAppFluentTheme } from '../theme/useAppFluentTheme'

const appStatusToastID = 'app-status'

// Fluent Toaster 的控制器单例：AppToaster 挂载时捕获，供组件外的模块级通知函数使用。
type ToastController = ReturnType<typeof useToastController>
let controller: ToastController | null = null

// app-status 状态位的存活跟踪：dispatch 同 id 不会刷新已渲染内容，
// 存活时必须走 updateToast（内部 updateId++ 触发重渲染并重启计时）。
let statusAlive = false

function notice(message: ReactNode, intent: ToastIntent) {
  if (!controller) return
  // 卡内容包语义 role:Fluent Toast 卡本身无 role(status/alert 在默认的 AriaLive
  // 镜像里,而镜像已被 announce 关闭),项目与 E2E 依赖 status/alert 语义。
  const content = (
    <div role={intent === 'error' ? 'alert' : 'status'}>{message}</div>
  )
  if (statusAlive) {
    controller.updateToast({ content, toastId: appStatusToastID, timeout: 5000, intent })
    return
  }
  statusAlive = true
  controller.dispatchToast(content, {
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
  return (
    <Toaster
      position="bottom-end"
      offset={{ horizontal: layout.toastOffsetPx, vertical: layout.toastOffsetPx }}
      announce={() => undefined}
    />
  )
}

// 常驻任务卡（上传/粘贴/批量删除）不走 Toaster：其 CollapseDelayed 高度动画的
// 结束态不追踪内容变高，进度卡会溢出视口。改为独立 fixed 层，由 Host 组件 portal 渲染。
// 该层容器在 React 之外创建、挂在 document.body 上，取不到主题 CSS 变量，
// 所以它自己的尺寸只能来自 styles/layout.ts（不得写 tokens.var 引用）。
let taskLayer: HTMLDivElement | null = null

// 只经 TaskLayerPortal 使用：直接往这层 portal 会绕过 FluentProvider，
// 卡片里的 tokens.* 全部失效，所以这里不导出。
function getTaskToastLayer(): HTMLDivElement {
  if (!taskLayer) {
    taskLayer = document.createElement('div')
    Object.assign(taskLayer.style, {
      position: 'fixed',
      right: `${layout.toastOffsetPx}px`,
      bottom: `${layout.toastOffsetPx}px`,
      zIndex: String(layout.zIndexTaskLayer),
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: `${layout.toastGapPx}px`,
      pointerEvents: 'none',
      maxWidth: `min(${layout.toastMaxWidthPx}px, calc(100vw - ${layout.viewportInsetPx}px))`,
    } satisfies Partial<CSSStyleDeclaration>)
    taskLayer.appendChild(document.createElement('style')).textContent =
      '#omnistore-task-layer > * { pointer-events: auto; }'
    taskLayer.id = 'omnistore-task-layer'
    document.body.appendChild(taskLayer)
  }
  return taskLayer
}

/**
 * 把常驻任务卡渲染进上面的独立层。
 *
 * 必须自带一层 FluentProvider：Fluent 的主题变量只写在 `.fui-FluentProvider`
 * 这个类上（`applyStylesToPortals` 也只是沿 React context 传类名，不会写到 :root），
 * 而该层挂在 body 直下、不在那个子树里。少了这一层，卡片里所有 `tokens.*`
 * ——内边距、间距、圆角、底色、字号，连同 Fluent ProgressBar——都会塌成初始值。
 */
export function TaskLayerPortal({ children }: { children: ReactNode }) {
  const theme = useAppFluentTheme()
  return createPortal(
    <FluentProvider theme={theme}>{children}</FluentProvider>,
    getTaskToastLayer(),
  )
}
