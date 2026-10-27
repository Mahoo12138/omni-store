import type { ReactNode } from 'react'
import {
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  mergeClasses,
} from '@fluentui/react-components'
import { useShellStyles } from './shell.styles'

export type BannerIntent = 'info' | 'success' | 'warning' | 'error'

// MessageBar 根节点是 role="group" + aria-labelledby，不提供 alert/status 语义；
// e2e 与读屏都按 role 找横幅，所以 role 契约由外层承载（与 StateView inline 同一套做法）。
const ROLE: Record<BannerIntent, 'alert' | 'status'> = {
  info: 'status',
  success: 'status',
  warning: 'alert',
  error: 'alert',
}

export interface BannerProps {
  /** info/success → role="status"，warning/error → role="alert"。 */
  intent?: BannerIntent
  /** 可选标题：渲染为 MessageBarTitle（Fluent 的加粗首行）。 */
  title?: ReactNode
  /** 可选操作区：渲染为 MessageBarActions，通常是重试/关闭按钮。 */
  action?: ReactNode
  /** MessageBar 形状：页面级用 square，组件级用 rounded（默认）。 */
  shape?: 'square' | 'rounded'
  className?: string
  children?: ReactNode
}

/** 内联消息横幅。取代散落在页面里的手写 `role="alert"` 红字块。 */
export function Banner({ intent = 'info', title, action, shape = 'rounded', className, children }: BannerProps) {
  const css = useShellStyles()
  return (
    <div className={mergeClasses(css.banner, className)} role={ROLE[intent]}>
      <MessageBar intent={intent} shape={shape}>
        <MessageBarBody>
          {title ? <MessageBarTitle>{title}</MessageBarTitle> : null}
          {children}
          {action ? <MessageBarActions>{action}</MessageBarActions> : null}
        </MessageBarBody>
      </MessageBar>
    </div>
  )
}
